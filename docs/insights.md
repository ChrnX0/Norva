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

> **FECHADO em 6 de setembro — e o achado é que ele ficou meio fechado por semanas.**
> A mudança de esquema veio: `products.packaging_items` existe, e `recordProduction`
> soma a lista em `needed`, com um comentário longo descrevendo esta mesma cicatriz.
> **O que ninguém migrou foi o exemplo.** A semeadura continuou comprando palito e
> embalagem, cobrando cinco centavos por unidade como taxa fixa, e deixando a lista
> vazia — então o defeito descrito aqui seguia acontecendo **no único produto que
> qualquer pessoa vê ao abrir o aplicativo**.
>
> Medido: 506 picolés, palito 10.000 → 10.000. Depois do conserto, 10.000 → **9.494**.
> E o custo por unidade **não mudou** (R$ 325,28 no ato, nos dois casos), porque a
> embalagem sempre esteve na taxa congelada — o que mudou foi o caminho dela.
>
> **A lição não é sobre embalagem.** Máquina construída e exemplo não migrado é um
> estado que passa em tudo: o código está certo, o teste do código está verde, e o
> comportamento que todo mundo observa é o antigo. Nenhuma guarda deste repositório
> pega isso, porque nenhuma compara *o que o código sabe fazer* com *o que o exemplo
> faz*. Achado ao fazer a conta de um número numa foto, que é de onde vieram cinco
> dos seis achados desta noite.
>
> **E três testes reprovaram junto**, cada um codificando o estado intermediário — um
> exigia `unitPackagingRate > 0`, outro derivava a proporção dele, e o terceiro usava
> `> 0` onde queria dizer `!== null`. Os três foram reescritos para afirmar o que
> queriam afirmar; o terceiro é a lição da asserção fraca de novo, encontrada por
> acidente.

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

## 4 de setembro — o conserto pela metade, e por que ele é o mais difícil de notar

`formatPercent` existe neste repositório com um docblock que descreve o defeito **no
passado**: *"existia em três lugares como `(x * 100).toFixed(1)`, que é o ponto decimal
do JavaScript e não o separador de quem lê"*. A função está certa, tem chamadores, e o
comentário narra a cura.

Três lugares continuavam com o padrão: a tela do insumo (duas vezes), a tela da compra,
e o assistente — este último com `.replace('.', ',')`, que acerta em português e **erra
no espanhol do México**, onde o separador decimal é o ponto. A tela da compra é onde o
dono decide se a nota subiu demais, e ela dizia `9.4%`.

**A regra que fica: o ajudante escrito não é o chamador trocado, e o docblock no
passado esconde isso.** Um repositório com a função certa, chamadores legítimos e uma
prosa dizendo "isto foi consertado" parece consertado — e é justamente por isso que
ninguém volta a olhar. A varredura barata (`grep` pelo padrão antigo, não pelo nome da
função nova) leva trinta segundos, e é ela que separa "consertei" de "consertei em
todos os lugares".

Onde procurar mais deles: todo docblock que diz "existia", "era assim antes" ou "isto
substituiu" é um convite para uma varredura pelo que ele diz ter substituído.

**O que mudou.** Os quatro chamadores; `movePhrase` do assistente passou a receber o
idioma (a decisão escrita é sobre as PALAVRAS dele serem portuguesas, não sobre o
número ser formatado à mão); e uma guarda de fonte que recusa a multiplicação por cem
com `toFixed` na mesma linha de um `%` — precisa a ponto de deixar passar os três
inocentes: taxa de quatro casas, contagem de tachos, e a prosa que cita o padrão.

## 4 de setembro — a ferramenta de olhar ficou cega de três jeitos no mesmo dia

O dono mandou uma foto da capa dele e disse: *refaça até acertar*. Fui olhar, e antes
de achar qualquer defeito de tela, achei que **eu não conseguia olhar**:

1. **Idioma.** `npm run shot` morreu procurando o campo "Procurar cidade". O navegador
   headless é `en-US`, e desde que o idioma virou escolha da empresa — com o aparelho
   como palpite do primeiro dia — o aplicativo abre em inglês ali. A ferramenta parou
   de funcionar por causa de um conserto meu, três horas antes.
2. **Luz.** `--escuro` ajustava o `colorScheme` do navegador. O aplicativo passou a ter
   escolha própria, com padrão claro (decisão do dono) — então a foto do escuro saía
   **idêntica à do claro**, e eu teria olhado duas vezes a mesma tela dizendo que vi as
   duas. Esta é a pior das três: a ferramenta não falhou, ela **mentiu**.
3. **Largura.** Ela fotografava 412 px e só. O corte que o dono viu — "Transpo…",
   "Relatóri…" — **não existe a 412**. A 360, que é o Android que uma fábrica de seis
   pessoas compra, ele aparece na primeira foto.

**A regra que fica: quando uma preferência deixa de ser do aparelho e passa a ser do
aplicativo, toda ferramenta que dirige o aplicativo de fora fica cega no mesmo
instante** — e a cegueira é silenciosa, porque a ferramenta continua produzindo uma
imagem. Idioma, tema e fuso saíram do aparelho hoje; três ferramentas dependiam do
aparelho para configurá-los; nenhuma reclamou.

E a terceira tem regra própria, que é sobre medir: **instrumento que só olha um
tamanho é cego para todo defeito que depende de tamanho**, que é metade dos defeitos
de tela. O `--largura` agora existe, e a foto estreita ganha nome próprio para não
sobrescrever a larga — comparação entre duas larguras é o motivo de a largura existir.

## 4 de setembro — a checagem do navegador AFIRMAVA o defeito

Consertados os quatro chamadores de porcentagem à mão, o `e2e` reprovou: ele exigia
`41.1%` e a tela passou a escrever `41,1%`. A checagem estava certa em relação ao
código e errada em relação ao mundo — foi escrita lendo o que a tela imprimia, e o que
a tela imprimia era o ponto decimal do JavaScript numa fábrica brasileira.

Duas asserções, as duas verdes por semanas, as duas travando o defeito no lugar. Uma
suíte que roda num navegador de verdade não protege de nada quando a asserção nasce de
uma cópia da saída.

**A regra que fica: asserção se escreve da REGRA, não da saída.** "Português escreve
porcentagem com vírgula" é uma regra e sobrevive a qualquer refatoração; `41.1%` é uma
fotocópia, e fotocópia de tela errada é defeito com teste de guarda-costas.

## 4 de setembro — cor de acento não é cor de fundo, e ícone só se julga ao lado dos irmãos

A capa tinha uma faixa de céu de 140 px com degradê entre duas cores da paleta. As
fotos das quatro combinações mostraram três formas do mesmo defeito: lama no claro
(verde da marca interpolado com rosa passa por cinza-barro no meio), adesivo pastel
aceso no escuro, e um vazio de 92 px no Papel, cuja identidade é traço.

**O erro não era a cor escolhida: era a ÁREA.** As cores desta paleta são tinta e
traço — medidas para desenhar sobre um fundo, não para preencher um terço da tela.
Ampliar uma cor de acento até virar fundo é exatamente o mesmo erro que ampliar
`inkFaint` até virar texto de corpo, e as duas coisas foram consertadas hoje, com seis
horas de diferença, sem eu perceber que eram a mesma.

E o ícone de "Produção" — o picolé num aplicativo que promete servir qualquer fábrica —
levou **três desenhos** para ficar de pé, cada um reprovado por uma foto da barra de
abas: três unidades empilhadas viraram irmãs do ícone de "Mais"; unidade sobre esteira
com roletes virou irmã do caminhão. **Ícone não se julga sozinho: ele se julga na
fileira em que vai viver.** O primeiro parecia ótimo isolado.

## 4 de setembro — "maior que" não é hierarquia, e o dono viu antes de mim

Subi `inkFaint` até a régua de 4,5:1 da WCAG de manhã, com guarda escrita, teste
passando e mutação plantada. À tarde o dono abriu o aplicativo e disse: *"cadê o tema
papel light? você fez o dark, ficou ok. falta o light."*

Ele estava certo, e a conta prova. No Papel claro, depois do meu conserto:

| camada | contraste sobre o papel |
|---|---|
| `ink` | 15,35 |
| `inkMuted` | **5,34** |
| `inkFaint` | **5,07** |

Cinco por cento de diferença entre a tinta do corpo e a da legenda. **Três camadas
viraram duas**, e a tela que separa rótulo de dado por tom ficou plana. O Orgânico
claro tinha o mesmo defeito (1,24× de passo); os dois ESCUROS estavam em 1,5× e por
isso pareciam prontos — é a diferença que ele viu sem medir nada.

**A guarda que eu mesmo escrevi passou**, porque ela pedia `média > fraca` e 5,34 é
maior que 5,07. **Ordem não é hierarquia.** Uma régua que só ordena aceita três tons
colados como se fossem três camadas, e o defeito que ela deixa passar é exatamente o
que a régua existia para impedir: uma tela onde tudo tem o mesmo peso.

**A regra que fica: guarda de grandeza contínua precisa de PASSO MÍNIMO, não de
ordem.** Onde houver escala — tinta, tamanho de fonte, espaçamento, opacidade —, a
pergunta certa nunca é "está na ordem?", é "a distância entre dois vizinhos é grande o
bastante para alguém perceber?". O piso agora é 1,35×, e ele não é gosto: é o que os
dois temas escuros, que estavam certos, já mediam.

E a segunda metade, que é mais desconfortável: **eu consertei um número e quebrei um
sistema.** A régua da WCAG olha uma cor contra um fundo, uma de cada vez; a hierarquia
é uma propriedade do CONJUNTO. Otimizar cada peça isolada contra um limite externo é
como escrever trinta e três telas que passam no teste e não parecem o mesmo
aplicativo — o defeito não está em nenhuma delas.

---

## 2026-09-05 — a guarda verde que mede um vizinho do que devia medir

**O que se viu.** Ao escrever o dossiê do projeto, quatro leitores independentes
compararam o que os documentos afirmam com o que o código faz. Apareceu o mesmo defeito
**três vezes num dia**, em três guardas diferentes que estavam todas verdes:

1. **A régua do contraste media ORDEM, não PASSO.** Já está registrada na entrada de
   ontem: `média > fraca` aceitava 1,05× como se fosse hierarquia. O dono viu na foto o
   que a guarda não via.

2. **A régua dos números do plano conta o VIZINHO.** `docs/roadmap.md:38` registra
   "capacidades: **18**". Existem **12** (`src/domain/access.ts:26-39`). A guarda que
   deveria impedir esse número de envelhecer (`src/bar.test.ts:127`) deriva a contagem
   assim: `new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)])` — todo literal minúsculo do
   arquivo. Isso pega as 12 capacidades **mais 6 dos 7 nomes de papel**; `storeManager`
   escapa por ter maiúscula. 12 + 6 = 18, a guarda fica verde, e o número escrito está
   errado desde que foi escrito. Derivado e conferido nesta sessão.

3. **O teste da mutação montava a própria janela de tempo com concatenação.** O CI pegou
   um defeito atravessando a suíte: tirar o `NAO_ESTORNADO` de `productionOn` faz a
   corrida estornada continuar contando como produzida. **A asserção que cobre isso já
   existia** (`src/data/repository.test.ts`), e a janela era
   `localDate(nowIso(),'America/Sao_Paulo') + 'T00:00:00.000Z'` — a data local de São
   Paulo carimbada com o fuso de Greenwich. `occurred_at` é UTC. **Entre 00h e 03h UTC os
   dois discordam de um dia**, a janela não contém o movimento, a consulta volta vazia, e
   `?? 0 === 0` passa com o filtro e sem ele. O CI rodou à 1h04. Às três da tarde aquele
   teste mata o mutante; à uma da manhã ele é cego.

E uma quarta, que é minha e do mesmo feitio: a capa do dossiê afirmava **17 telas** onde
há **24**, porque eu contei com `git ls-files 'app/**/*.tsx'` — glob que exige pelo menos
um diretório e não casa `app/catalog.tsx`. A ferramenta de medida tinha um ponto cego e o
número saiu confiante.

**Por que importa.** As quatro medem coisas diferentes e erram do mesmo jeito: **a guarda
não mede a propriedade, mede um vizinho dela que costuma coincidir.** Ordem coincide com
hierarquia até dois tons se colarem. Literais minúsculos coincidem com capacidades até
alguém escrever um papel em minúsculas. Data local coincide com data UTC até passar da
meia-noite em Greenwich. Um glob de subdiretório coincide com "todos os arquivos" até
alguém pôr um arquivo na raiz.

E o verde é pior que o vermelho aqui, porque **guarda verde compra a decisão de não
olhar**. As três primeiras foram escritas justamente para poder parar de conferir à mão.

**A regra que fica, e ela é operacional:** antes de escrever a guarda, escreva o defeito
que ela deve pegar e **veja a guarda falhar**. Se ela nunca ficou vermelha com o defeito
na frente, ela não foi verificada — foi acreditada. Fizemos isso com a correção do
mutante desta sessão: a mutação foi aplicada à mão, o teste falhou com a mensagem certa,
a mutação foi retirada, 74/74. É a diferença entre E0 e E3, e custa dois minutos.

**Corolário para grandeza contínua e para tempo.** Nunca monte janela de tempo por
concatenação de string: `dayWindow` existe para perguntar ao `Intl` que dia local é um
instante e devolver as bordas como instantes UTC. Um teste que carimba `Z` numa data
local passa pelo motivo errado em algum horário do dia — e a suíte inteira fica honesta
às três da tarde e mentirosa à uma da manhã.

**O que mudou.** `src/data/repository.test.ts` passou a usar `dayWindow` (commit
`be9ac0a`), e o mutante morre. As outras três não viraram conserto de código porque o
repositório vai ser apagado: viraram as seções 24, 33 e 34 do dossiê, e esta entrada.

## 2026-09-05 — padrão não é escolha: um dia inteiro fotografando a mesma cara duas vezes

**O que apareceu.** O `npm run shot` tira quatro fotos de cada tela — Papel e Orgânico,
claro e escuro — e é com elas que eu digo ao dono que as quatro caras estão certas.
Comparei duas delas byte a byte, por desconfiança de que estavam parecidas demais:

    more-papel-claro-com-dado.png  vs  more-organico-claro-com-dado.png  →  0 px diferentes

Zero. De 1.507.920. **Eram o mesmo arquivo com dois nomes.** O mesmo vale para o par
escuro, e para `capa-*-escuro` de duas horas antes. Só o claro/escuro era real.

**A causa.** O laço clicava a cara nos Ajustes **só quando ela era Papel**. O Orgânico
vinha "de graça", por ser o padrão de um contexto de navegador novo — e era, até o dia 5
de setembro, quando o dono escolheu o Papel como padrão e a decisão foi escrita em
`src/theme/Appearance.tsx:75`. A partir daquele commit, toda foto com `organico` no nome
era Papel. Ninguém tocou no `shot.mjs`; ele simplesmente parou de valer.

**Por que importa, e por que dói.** Este é o **terceiro** registro da mesma frase neste
projeto, e o próprio arquivo já a carrega duas vezes escritas por mim: *"ferramenta de
olhar que mente sobre o que está olhando é pior que não ter"*. A primeira foi o `dist`
reusado por existir; a segunda foi o `colorScheme` do navegador deixando de valer quando
a luz virou escolha da empresa. Esta é idêntica em forma: **a ferramenta herdava um
estado em vez de estabelecê-lo**, e herdar dá certo exatamente até alguém mudar o que se
herda — sem aviso, porque nada quebra.

E o custo real não é a foto errada: é que eu **mostrei as quatro ao dono** dizendo que
eram quatro, depois de ele ter pedido, com todas as letras, *"faz geral dos temas
aprovados, papel e organico nas variações light e dark para nunca mais errar nisso"*.

**O que mudou.** Duas coisas, e a segunda é a que vale.

1. `scripts/shot.mjs` passou a **escolher sempre as duas** — luz e cara —, mesmo quando a
   escolha coincide com o que já está lá.
2. A ferramenta passou a **se desmentir**: guarda a soma SHA-1 de cada imagem e sai com
   código 1 se duas fotos de nomes diferentes saírem idênticas. "Clicar sempre" conserta o
   defeito de hoje; um seletor que deixa de casar amanhã traz o mesmo defeito de volta
   calado. O que impede é a conferência, não a lembrança.

**A regra que fica.** Toda ferramenta que fotografa uma escolha tem de **fazer** a
escolha, nunca recebê-la pronta — e tem de ter um jeito de provar que as saídas que ela
chama de diferentes são diferentes. Padrão não é escolha: é o que sobra quando ninguém
escolheu, e ele muda sem avisar quem dependia dele.

## 2026-09-05 — o relógio de nove segundos que me fez procurar defeito no lugar certo errado

**O que apareceu.** Fotografei o aplicativo inteiro e a capa disse *"Hoje a fábrica
ainda não produziu"*, com a última corrida em **8 de julho** — dois meses antes de
hoje —, a semana inteira sem barra e a aba de produção no estado vazio. A leitura
óbvia era que a simulação de noventa dias **parava de produzir no dia 59**, e eu fui
procurar o defeito lá: consumo que zera o insumo, compra que não dispara, receita sem
ingrediente.

Rodei a simulação fora do navegador para achar o dia em que ela morre. Ela não morre:
**98 corridas em 90 dias**, entregas e notas na proporção certa. O defeito não estava
na simulação — estava na ferramenta que a acionava.

**A causa.** O `shot.mjs` clicava em "Plantar" e esperava **nove segundos fixos**. Nove
segundos bastavam para a quinzena, que era o que a semeadura fazia quando essa linha
foi escrita. No mesmo dia 5 a semeadura virou noventa dias — pedido do dono — e o
SQLite em WebAssembly parou de terminar dentro da janela. A ferramenta seguia em
frente com o banco pela metade e fotografava uma fábrica que produziu até o meio do
caminho e parou.

**Por que importa.** Não é o tempo perdido: é que eu quase consertei uma coisa que
estava certa. Um relógio fixo é uma **afirmação sobre a máquina de quem roda**, e ela
envelhece sozinha — o mesmo feitio da armadilha da entrada de cima, em que a
ferramenta herdava o padrão em vez de escolher. As duas dizem a mesma coisa: *o que a
ferramenta não estabelece, ela está adivinhando; e o palpite dela vira o meu
diagnóstico.*

E a segunda ordem disso é pior que a primeira. Um relógio curto não falha — ele
**produz uma observação plausível**, e observação plausível é o que dirige a próxima
hora de trabalho. Se a simulação tivesse mesmo um defeito no dia 59, eu teria
"confirmado" a hipótese olhando a mesma foto de novo.

**O que mudou.** Três coisas em `scripts/shot.mjs`:

1. A espera passou a ser pelo **aviso de pronto** que a tela já dava ("Pronto: N
   corridas, M entregas e K notas"), com folga de quatro minutos. Fato, não relógio.
2. **Bandeira desconhecida reprova.** Eu tinha escrito `--todas` em vez de `--tudo`, e
   a ferramenta caiu no padrão e fotografou a capa quatro vezes dizendo que estava
   tudo certo. Mesma família: seguir em frente com um padrão quando a intenção era
   outra.
3. **Uma tela que não abre não leva as outras oitenta junto.** A falha é anotada e
   reprovada no fim, junto com as fotos idênticas — em vez de derrubar a execução na
   terceira de oitenta e quatro.

**A regra que fica.** Ferramenta de observação não espera tempo: espera **sinal**. E
quando um número parecer contar uma história boa demais para ser conferida na hora,
reproduza-o **fora da ferramenta que o produziu** antes de sair consertando código —
foi o que salvou esta rodada.

## 2026-09-05 — a regra escrita não impediu a segunda vez, e o dono viu antes de mim

**O que apareceu.** O dono mandou uma foto do painel dele: uma tarefa em **1h03min**
com o rótulo *"Wait for the running suite then start a fresh one"*. Perguntou por que
demorava tanto. Era um laço meu:

    until ! pgrep -f "e2e/flow.mjs"; do sleep 10; done; npm run e2e

O `pgrep -f` casa com a **linha de comando do próprio shell**, que contém o texto
`e2e/flow.mjs`. O laço esperava a si mesmo. Uma hora de relógio, zero trabalho — e
ele nem chegou a disparar a suíte que existia para disparar.

Ao lado dele, um `expo start` de **6h38**, esquecido de manhã, com o Metro observando
o disco numa máquina de quatro núcleos enquanto eu exportava pacote e abria quatro
navegadores. Foi essa CPU roubada que produziu a fatia vermelha que eu diagnostiquei
como disputa — a mesma frase do dia 3, e desta vez a causa tinha nome e PID.

**Por que importa.** Isto **já estava escrito** no `CLAUDE.md`, na seção de
operação, com o mesmo laço citado. A regra existia, eu a li nesta sessão, e escrevi o
laço mesmo assim. Conselho não sobrevive à conveniência do momento; foi essa a lição
que criou a proofgate, e ela vale para o operador tanto quanto para o código.

E o custo real é de novo o de segunda ordem: o tempo perdido é o menor pedaço. O
grande é que a lentidão virou **fato observado sobre o projeto** — "a barra é lenta",
"o navegador disputa" — quando a causa era um processo parado e outro esquecido. Duas
vezes eu ajustei paralelismo por causa disso.

**O que mudou — e a primeira versão desta linha estava errada.** Eu ia escrever
"o `CLAUDE.md` passou a dizer não escreva laço de espera". Mas ele **já dizia**, com
este laço citado, e eu escrevi o laço mesmo assim. O dono foi direto ao ponto: *"não
é a primeira vez que você fica esperando essas tarefas bugadas. **se torne imune a
isso**"* — e imune não é lembrar melhor.

Então virou guarda: `.claude/hooks/sem-espera.sh`, um `PreToolUse` do Bash ao lado do
`push-guard` da proofgate, que **recusa o comando antes de ele rodar**. Quatro
padrões, cada um com uma cicatriz atrás:

| recusa | de onde veio |
|---|---|
| `until`/`while` com `sleep` dentro | esta, 1h03 esperando a si mesma |
| `pgrep -f` cujo padrão está na própria linha | a causa exata do laço acima |
| `sleep` de 30 s ou mais em primeiro plano | espera não é trabalho |
| `nohup ... &` | a mutação órfã de oito horas, 3 de setembro |

Conferido com prova positiva e negativa: os quatro comandos ruins são recusados, e
`npm test`, `npm run shot -- --tudo`, `pkill` por PID e um `git commit` cuja mensagem
contém a palavra "sleep" passam.

E o `CLAUDE.md` ganhou a linha que faltava sobre o vizinho: antes de culpar a máquina
de lenta, olhar `ps -eo etime,args --sort=-etime` e ver o que está lá desde a manhã.

**A regra que fica.** Espera não é trabalho — e laço de espera não é nem espera: é
uma afirmação de que se sabe reconhecer o fim de outra coisa. Quando essa afirmação
erra, ela não falha: ela ocupa a máquina e o relógio, e o erro chega como uma
pergunta do dono. **E regra que já falhou uma vez não se reescreve: vira script.**

## 2026-09-05 — a loja só recebia, e o número disso estava numa tela como verdade

**O que apareceu.** Com o Orgânico finalmente fotografado de verdade, "Estoque por
lugar" mostrou o Mercado do Zé com **8.974 picolés na prateleira** e o freezer da
fábrica com **vinte e sete mil**. Nenhuma loja de bairro guarda isso, e nenhum
freezer de fábrica de seis pessoas também.

Não é um número feio numa tela de teste: é o **oposto** do que o dono pediu ao mandar
plantar três meses — *"alimenta o banco de dados para as informações apresentarem
dados verdadeiros"*. Dado plantado que mente é pior que banco vazio, porque tela
vazia se reconhece e número absurdo se lê.

**Três causas, e a primeira é defeito, não realismo.**

1. **O despacho lia o saldo da EMPRESA onde precisava do saldo da SALA.** `listItems`
   soma tudo, inclusive o que já está na prateleira das lojas. A fábrica despachava o
   que estava a dez quilômetros dela, e o saldo da sala podia ir a **negativo em
   silêncio** — o mesmo erro que o piso da produção existe para impedir, cometido
   pela porta de trás, porque o caminho da semeadura não passa pela tela que impede.
2. **Produzia mais do que despachava**, quinhentas a mil por dia contra 100–400 por
   destino com 45% de chance. Trezentas sobrando por dia, noventa dias.
3. **O destino só recebia.** Nunca saía nada de lá.

**Por que a terceira não se conserta com um `recordSale`.** O tipo `sale` existe em
`MovementKind` e **não tem caminho de escrita**: ele é da F4, junto com o Espelho da
Loja. Escrever um agora seria mexer no caminho de escrita de `movements` — o portão
P3, o mais caro que este projeto tem — para servir uma semeadura.

O que já existe e já grava é a **contagem cega**, e o `docs/roadmap.md` a põe dentro
do escopo com todas as letras: *"a captura entra, o relatório espera"*. E ela é
exatamente o que uma fábrica sabe hoje sobre a prateleira de um cliente: **não
quanto vendeu, mas quanto sobrou.** A diferença entra como `adjustment`, que é
bookkeeping neutro — não vai para o relatório de perdas, e é isso mesmo: o que saiu
dali não foi perdido, foi comprado por alguém.

**O que mudou.** `src/data/simulate.ts`: o despacho consulta `balanceByLocation` da
sala da fábrica e mantém só o giro do dia seguinte; cada destino confere a prateleira
uma vez por semana, com o dia escalonado para as três lojas não conferirem todas na
segunda. Depois: fábrica com 3.268, lojas com 500 a 1.400, 157 entregas, 96 corridas,
26 notas e 110 conferências em noventa dias. O aviso de plantio passou a contar as
conferências, nos três idiomas.

**A regra que fica, e ela vale além da semeadura:** **um caminho que escreve no razão
sem passar pela tela não herda as travas da tela.** A produção impede consumir de
outra sala; a semeadura, que chama o repositório direto, não impedia nada — e o
resultado ficou guardado como fato. Toda vez que um script escreve pela porta dos
fundos, as garantias que moram na porta da frente têm de ser repetidas ali, ou
verificadas depois.

## 2026-09-05 — quase "consertei" a contagem, pela quarta vez na mesma armadilha

**O que apareceu.** Procurando outros lugares com o mesmo defeito que a semeadura
tinha (saldo da empresa onde se precisa do saldo da sala), achei em
`app/inputs/[id].tsx` a linha

    const expected = item.onHandBaseUnits;

seguida, vinte linhas abaixo, de um `recordCount` que grava contra o saldo da SALA.
Promessa e escrita divergindo — o achado 6 da auditoria de volta noutra porta. Eu
escrevi o conserto, ele compilou e o lint passou.

**Estava errado.** `item` não vem do saldo da empresa: vem de
`findItem(LOCAL_COMPANY_ID, id, room)`, com a sala da rota. Quando há sala escolhida,
aquele número **é** o da sala; quando não há, a contagem só é oferecida se o item
estiver num lugar só, e aí a soma de um é igual à soma de todos. Estava certo nos
dois caminhos, com o motivo escrito em dois docblocks e um teste
(`repository.test.ts`, "the shelf a screen shows is the shelf a count is compared
against").

**Por que importa.** É a **quarta** vez nesta sessão que eu aponto defeito no que era
decisão registrada, e as três anteriores estão no `CLAUDE.md` como aviso que eu já
tinha lido. O padrão é sempre o mesmo e agora dá para nomear: **eu li a linha e não
segui a origem do valor.** `item.onHandBaseUnits` parece do escopo da empresa porque
o nome não carrega a sala — a sala entrou como argumento na chamada, trinta linhas
acima.

E o custo do "conserto" não teria sido zero: minha versão lia o mesmo número de uma
segunda fonte (`spread`), e duas fontes para um número é exatamente a divergência que
o guarda da assinatura e o `traco` no tema existem para impedir. Eu teria criado a
doença enquanto acreditava estar curando-a.

**O que mudou.** A linha voltou ao que era. E a regra que fica é mais estreita e mais
útil que "procure a decisão": **antes de chamar um valor de errado, siga a origem
dele até a chamada que o produziu.** Nome de campo não diz escopo — quem diz é o
argumento que alguém passou.

## 2026-09-05 — o mesmo relógio estava em dois arquivos, e eu consertei um

**O que apareceu.** Depois de trocar o `waitForTimeout(9000)` do `shot.mjs` por uma
espera pelo aviso de pronto, a semeadura de três meses ficou mais pesada (as
conferências de prateleira entraram) e a **checagem do navegador estourou** —
esperando trinta segundos por um botão "Entendi" que ia aparecer dez segundos
depois.

A causa era a linha gêmea: `e2e/flow.mjs` tinha o **mesmo** `waitForTimeout(9000)`
depois do mesmo clique em "Plantar". Eu tinha consertado o defeito num arquivo e
deixado a cópia dele no outro, no mesmo dia, sabendo exatamente o que ele era.

**Por que importa.** Não é distração: é que **consertar uma ocorrência dá a sensação
de ter consertado o defeito**. A rodada seguinte cobrou a diferença, e cobrou no
lugar mais caro — uma fatia vermelha no navegador, que é onde um erro custa três
minutos de espera antes de aparecer.

**O que mudou.** As duas esperas viraram espera por fato. E, porque duas ocorrências
já são um padrão, virou guarda: `src/selectors.test.ts` recusa qualquer
`waitForTimeout` de **cinco segundos ou mais** em `e2e/flow.mjs` e `scripts/shot.mjs`.

A régua de cinco segundos separa duas coisas que só parecem iguais. Abaixo dela é
espera de **quadro** — a tela precisa de um instante para desenhar, e o número é
folga sobre uma animação cuja duração o próprio aplicativo escolhe; há umas duzentas
e cinquenta dessas e nenhuma jamais falhou. Acima, é espera de **trabalho**, e a
duração do trabalho depende da máquina, do tamanho do dado e do dia.

E a guarda tem prova negativa: um teste irmão mostra que ela fica vermelha com
`waitForTimeout(9000)` na frente e verde com `waitForTimeout(3500)` — porque guarda
que nunca ficou vermelha com o defeito na frente foi acreditada, não verificada.

**De passagem, uma guarda que eu não sabia que existia me pegou.** Escrevi o seletor
novo como `/^Pronto: \d+ corridas/` e o `selectors.test.ts` reprovou: ele confere que
toda expressão do e2e casa com alguma frase do dicionário, com os marcadores
`{{...}}` apagados — e `\d+` não casa com o buraco vazio. Sem ela eu teria descoberto
isso trinta segundos depois, dentro do navegador, longe da linha que quebrou. É o
argumento inteiro a favor de guarda de fonte, escrito por ela mesma.

**A regra que fica:** quando um defeito vira conserto, **procure os irmãos dele antes
de fechar** — `grep` pelo formato, não pelo arquivo. E se houver dois, o conserto não
é a edição: é a guarda.

## 2026-09-05 — a configuração que parecia restringir e não restringia nada

**O que apareceu.** O painel do dono recebeu, só nesta sessão, uma dúzia de avisos de
deploy da Vercel — um por push, cada um construindo uma web que ninguém vai olhar
antes de o aplicativo estar pronto. O `vercel.json` do repositório dizia:

    "git": { "deploymentEnabled": { "main": true } }

que **lê** como "só a `main` publica". A documentação diz o contrário, com todas as
letras: *"Unspecified branches default to true."* O objeto é uma lista de **exceções**,
não uma lista de permissões — então aquela linha não desligava nada, e toda branch
continuava publicando.

**Por que importa.** O dono deu uma instrução permanente sobre isso — *"cuidado para
não queimar todos os créditos"* — e o plano desta sessão nomeou o item ("desligar o
deploy automático nesta branch"). Ele ficou por fazer porque, ao abrir o arquivo, a
configuração **parecia** já feita. Configuração que lê como restrição e não restringe
é pior que ausência de configuração: ausência se nota.

É a mesma família de tudo o que apareceu hoje — o padrão herdado que virou escolha, a
guarda que media o vizinho, o nome de chave que descrevia a conta em vez do texto. Em
todos, **a coisa parecia dizer o que não dizia**, e ninguém foi conferir na fonte.

**O que mudou.** `"*": false` ao lado do `"main": true`. A regra de sobreposição está
documentada e é a que se quer: um ramo que casa com duas regras publica se **alguma**
delas for `true`, então `main` continua publicando e nenhum outro publica.

**E o conserto errou também, na mesma hora.** Pus `"*": false`, empurrei, e o deploy
seguinte — do commit que continha o conserto — subiu igual. A documentação diz, numa
frase que eu tinha lido sem pesar: *"Match multiple branches using **minimatch**"*. Em
minimatch, `*` **não atravessa a barra**, e a branch é `claude/recipes-production-app-vbwrde`.
Conferido contra a biblioteca de verdade, que é o que eu devia ter feito antes de
empurrar:

    minimatch('claude/recipes-production-app-vbwrde', '*')   → false
    minimatch('claude/recipes-production-app-vbwrde', '**')  → true
    minimatch('main', '**')                                  → true

O globstar é o certo, e `main` continua publicando pela regra de sobreposição
documentada (casa com dois padrões, e basta um ser `true`).

**A regra que fica, agora em duas metades.** Antes de acreditar que uma configuração
restringe, **leia a documentação do valor-padrão dela** — o que não está escrito não é
"nada", é o padrão, e o padrão costuma ser permissivo. E antes de acreditar que o
conserto restringe, **rode o casamento** contra a biblioteca que o serviço nomeia: um
padrão de glob é código, e código se executa em vez de se ler. Eu escrevi um conserto
que parecia certo para um defeito que era "parecia certo" — duas vezes a mesma
armadilha, com dez minutos de intervalo.

## 2026-09-06 — a marca desenhada com cuidado, guardada no disco e nunca citada

**O que apareceu.** A auditoria listava, entre os médios, *"a tela de abertura ainda
ser o andaime da Expo"*. Fui ver esperando encontrar uma imagem feia. Não era isso: o
`scripts/icons.mjs` **já desenhava** `assets/splash-icon.png` a partir do caminho da
marca em `brand.ts`, com fração própria e comentário explicando a escolha — e o
`app.json` **não tinha `expo-splash-screen`**. O arquivo era gerado, versionado e
jogado fora a cada abertura; o aplicativo abria na tela padrão da Expo, branca.

**Por que o P1 não pegou.** A regra da casa é *"quem chama isto no mesmo commit?"*, e
ela mira código: função exportada e nunca importada, chave de dicionário sem tela,
coluna sem escrita. Aqui não havia código — havia um **caminho dentro de um JSON de
configuração**, e nenhuma ferramenta de código enxerga isso. É a mesma doença numa
superfície onde o remédio não alcançava.

E ela some da vista com facilidade porque **a ausência não parece ausência**: uma tela
de abertura branca é uma tela de abertura. Ninguém abre o aplicativo e pensa "faltou
alguma coisa aqui" — pensa que é assim.

**A segunda metade, que só apareceu lendo o contrato.** O `expo-splash-screen` **não
recolore a imagem**: o modo escuro pede o próprio arquivo (`dark: { image }`). Com um
arquivo só, a marca de grafite abriria sobre papel carvão. Seria a cicatriz do tema
claro ilegível de novo, na primeira tela que existe.

**E a terceira, que era um flash.** Configurada, a abertura sumia cedo demais: o casco
abre o banco devolvendo uma `View` vazia, e só depois a `AppearanceProvider` lê do
disco qual cara e qual luz a empresa escolheu. Entre uma coisa e outra o aparelho
mostrava **branco** — entre uma abertura carvão e uma página carvão. Agora
`preventAutoHideAsync` roda no escopo do módulo (como a documentação manda: dentro de
componente chega tarde) e a abertura sai quando as duas coisas estão prontas.

**O que mudou.** `expo-splash-screen` configurado com os dois papéis do Papel
(`#FAF7F2` e `#1B1610`), a marca gerada nas duas tintas, e `src/marca.test.ts`
cobrando a ponte nos dois sentidos — o gerador desenhou, a configuração cita —, com
prova negativa: tirando a citação da abertura escura, a guarda fica vermelha nomeando
o arquivo.

**Nível de evidência, dito por extenso: E2.** As imagens foram compostas sobre os
papéis e olhadas; o contrato do plugin foi lido; tipos, lint, 354 testes e o navegador
estão verdes. **A abertura em si não foi vista**, e a própria documentação da Expo
avisa por quê: desde a SDK 52, nem o Expo Go nem o build de desenvolvimento reproduzem
a tela de abertura — ela só se julga num build de release. Fica assim escrito em vez
de afirmado.

**A regra que fica:** o P1 vale para **arquivo** também, não só para código. Toda peça
que uma ferramenta gera precisa de alguém que a cite, e quando o citador é um JSON de
configuração, a ponte tem de ser conferida por um teste — porque nenhum compilador vai
conferir por você, e a falta se disfarça de padrão.

## 2026-09-06 — a função "sem chamador" não queria ser apagada, queria ser chamada

**O que apareceu.** A auditoria listava `forgetSentBefore` entre os médios: *sem
chamador fora de teste*. Pelo portão P1 desta casa — *"quem chama isto no mesmo
commit? Sem chamador, não entra"* — a resposta reflexa é apagar.

Ler o que ela faz muda a resposta. Ela apaga da fila o que o servidor **já
confirmou**, e o docblock dela dizia as duas metades desde que foi escrito: vale
guardar por alguns dias, para poder dizer a alguém o que subiu e o que não subiu, e
vale largar depois, para o celular de uma fábrica movimentada não carregar um ano
deles. O motor de sincronia (`src/sync/engine.ts`) manda, marca o que foi aceito — e
**nunca varre**. Apagar a função teria transformado um defeito conhecido num defeito
esquecido: no dia em que a sincronia existir, a fila só cresce.

**O P1 tem duas saídas, e eu só via uma.** "Sem chamador" pergunta se a peça deve
existir; não responde qual das duas pontas está faltando. Aqui a peça estava certa e
faltava a chamada — e a diferença entre as duas leituras é toda a diferença entre
consertar e enterrar.

De quebra, `now?: () => number` estava declarado no `SyncOptions` e não era usado por
ninguém: o relógio injetável existia esperando exatamente este chamador. Duas órfãs
que eram uma coisa só, separadas.

**E o teste passou verde com o defeito na frente.** Escrevi a prova medindo
`pendingCount()`. Comentei a linha da faxina para conferir e ele **continuou
passando**: `pendingCount()` conta `sent_at IS NULL`, ou seja mede o *marcar*, não o
*varrer* — o vizinho da propriedade, quinta vez nesta sessão. Reescrito contando
linhas da tabela, ele fica vermelho sem a faxina e verde com ela, nos dois casos (o
que passou da janela sai; o que subiu hoje fica).

**A regra que fica:** antes de apagar uma peça sem chamador, **leia o que ela faz**.
Se o que falta é a chamada, apagar não remove dívida — remove a evidência dela. E o
P1 continua valendo: o commit que decide isso tem de trazer o chamador, ou a remoção.

## 2026-09-06 — a forma escrita estava incompleta, e conferir antes de construir mostrou onde

**O que apareceu.** Deixei escrita no roadmap a forma do próximo P3 — a embalagem
digitada, que é preço por unidade, guardada como `Cents` inteiro — para executar numa
rodada seguinte em vez de decidir cansado. Antes de construir, fui conferir a forma
contra o código. Ela estava **incompleta em dois pontos**, e os dois teriam aparecido
tarde:

1. **`costPerProductUnit` recebe `{ cents?: Cents; itemsRate?: number }`**, e o
   docblock dela explica que os dois são nomeados de propósito: `itemsRate` é a
   embalagem que sai do estoque, `cents` é a que ninguém quis virar item. A distinção é
   de **procedência**, não de tipo. Minha forma dizia "passa o valor fracionário
   direto", o que na prática fundiria os dois — e perderia a razão que o docblock
   guarda há duas migrações.

2. **Três telas MOSTRAM esse valor com `formatMoney`** — o assistente, a ficha da
   receita e a lista. Com uma taxa fracionária, `formatMoney(0,4)` imprime **R$ 0,00**.
   Ou seja: o conserto tiraria o defeito do razão e o colocaria na tela, dizendo com
   todas as letras que a embalagem é de graça. O aplicativo já tem a resposta e ela é a
   mesma da polpa — **a cada mil unidades** (`app/inputs/[id].tsx:167`).

**Por que importa.** A forma parecia completa quando eu a escrevi: migração, coluna
dormente, tela passando o valor. Faltava justamente a metade que não está no caminho
de escrita — o caminho de LEITURA. Um número tem dois lados, e eu tinha desenhado um.

E o modo como isso apareceu é o argumento inteiro a favor do portão P3: **decidir a
forma numa rodada e executá-la na seguinte, com uma leitura adversarial no meio.** Se
eu tivesse implementado logo depois de escrever, as três telas dizendo "R$ 0,00" só
apareceriam numa foto — ou, pior, não apareceriam, porque uma embalagem de cinco
centavos (o padrão semeado) continua imprimindo certo. O defeito só nasce com o valor
pequeno, que é exatamente o caso que o conserto existe para servir.

**A regra que fica:** forma escrita não é forma pronta. Antes de executá-la, **siga o
valor pelos dois lados** — quem escreve e quem lê. O portão P3 diz "é caro e
permanente"; o que ele quer dizer na prática é "a forma tem de ser lida por olhos que
não são os que a escreveram", e uma rodada de intervalo é a versão barata disso.

## 2026-09-06 — o portão P2 é uma pergunta, e eu a respondi sozinho

**O que apareceu.** Travei o reflow em colunas no portão P2 completando a frase da
casa — *"eu mudaria isto se eu visse ___"* → *"se eu visse alguém usando um tablet"* —
e concluí: ninguém neste produto usa. Escrevi isso no roadmap com o raciocínio inteiro:
as decisões do dono falam de celular de fábrica, luva e câmara fria; o único tablet que
existe é uma largura no meu script de foto.

O dono leu e respondeu em uma linha: *"eu tenho um tablet, depois a gente compila o
apk e eu testo, bora pro seguinte."*

**Por que importa.** O P2 **não é uma afirmação sobre o mundo, é uma pergunta** — e o
que ele pergunta é se existe quem observe. Eu tratei a pergunta como se a resposta
fosse dedutível do repositório, e ela não é: a resposta estava do outro lado da
conversa, a uma frase de distância. O portão travou trabalho por eu não ter perguntado.

E ele tem um irmão na mesma rodada, com o mesmo formato. Escrevi que o Espelho da Loja
e as compras inteligentes "travam por dado". O dono cobrou: *"vc nao pode alimentar
mais dados no banco de dados??????"*. Podia. O que eu tinha misturado eram três coisas
que travam por motivos diferentes — o fiscal trava por certificado e homologação
(externo, e nenhum dado encurta), e os outros dois **não travam para construir, travam
para calibrar**. Qualquer padrão que um relatório descubra num banco semeado é o padrão
que a semeadura plantou; a régua só se afere contra uma fábrica. Construir, exercitar a
consulta com o razão crescido, ver a tela com o que dizer: tudo isso era agora.

Os dois erros são o mesmo erro: **eu transformei "não sei" em "não dá"**, e escrevi a
conclusão com a confiança de quem mediu. Um portão bem escrito não protege disso — ele
até ajuda, porque dá à conclusão a forma de uma regra.

**O que mudou.** As duas decisões do dono estão no `CLAUDE.md`, o roadmap foi corrigido
nos dois pontos (o reflow voltou como construível, e a F4 passou a dizer "construir
agora, calibrar depois"), e a coluna que eu tinha escrito como "trava por dado" virou
uma tabela que separa os três casos.

**A regra que fica:** quando o portão P2 pedir um observador, **procure o observador
antes de declarar que não existe** — e o primeiro lugar a procurar é a pessoa com quem
você está falando. Dedução sobre quem usa o produto não é medida; é palpite com cara
de método.

## 2026-09-06 — o `else` é um lugar onde se cai, não uma escolha que se faz

**O que apareceu.** O dono olhou a foto do Orgânico e disse: *"agora parece papel, mas
o q estava NEM ORGANICO ERA"*. Fui procurar o defeito esperando um erro de cor, e
encontrei outra coisa: o Orgânico era o Papel com a cena trocada. Dois ternários
`skin === 'papel' ?` no meio de mil linhas da capa, e toda a composição — manchete,
diagrama, régua, versalete — era a da página impressa, usada nas duas caras.

Puxando o fio, o mesmo padrão estava em mais oito arquivos: `Card`, `Field`, `Button`,
`Chip`, `Confirm`, `Sparkline`, `CollapsingHeader` e `Sky` decidiam cada um por conta
própria com `skin === 'papel' ?`. Nenhum deles estava errado. O problema é o que
acontece com o **terceiro** tema, e o dono confirmou que ele vem: *"futuramente a gente
vai criar mais skins"*.

**Por que importa.** Uma pele nova não cairia num erro — cairia no `else`. Herdaria as
onze respostas do Orgânico sem que ninguém tivesse decidido nenhuma delas, e o
compilador ficaria verde, porque `else` é sintaticamente perfeito. É o oposto do
`Widen<T>` do i18n, que existe justamente para transformar "faltou" em "não compila":
ali a omissão grita, aqui ela herdava em silêncio.

**O que mudou.** A pele passou a dizer o que ela **decide**, e quem desenha pergunta:
`genero: 'pagina' | 'superficie'`, `tintaCheia: 'marca' | 'area'`, `marcaVemDoTom`,
`titulo`, `radius.controle`. E `skins` virou `Record<Skin, {...}>` em vez de `as const`
— pele sem traço declarado agora não compila. Para a composição, `src/home/capas/`:
uma roupa por pele, com casco de página, casco de peça e as peças que ela desenha à sua
maneira. Um `registro.test.ts` recusa qualquer arquivo de `src/home` ou `src/components`
que volte a decidir pelo NOME da pele, com prova negativa.

**A regra que fica:** quando um `if` responde "qual dos dois", pergunte o que acontece
quando existir um terceiro. Se a resposta for "cai no `else`", o `if` não é uma
condição — é uma tabela que ainda não foi escrita. E o nome da opção tem que dizer o
que ela **decide** (`genero: 'pagina'`), nunca **quem** a usa (`ehPapel`): o segundo
compila igual e devolve o mesmo defeito na pele seguinte.

## 2026-09-06 — o invólucro vazio que só aparece quando o casco muda

**O que apareceu.** Ao dar ao Orgânico um cartão em volta de cada peça, precisei saber
quais peças têm o que dizer. Descobri que oito das quinze devolviam
`<>{condição ? <Peça/> : null}</>` — um fragmento que **nunca é nulo**, mesmo quando
não desenha nada. Havia meses assim.

**Por que importa.** Enquanto o casco do Papel era o nada, um invólucro vazio ocupava
zero pixel e ninguém via. No Orgânico, cada peça mora num cartão branco: o mesmo
invólucro viraria um cartão vazio no meio da capa. O defeito não nasceu com o tema
novo — ele estava lá, **escondido por uma coincidência de estilo**, e o tema só tirou
a coincidência.

O irmão dele apareceu na mesma varredura: a semana morava DENTRO da peça da produção
do dia. Dois assuntos numa peça só, e ninguém podia reordenar ou esconder um sem o
outro. Isso não era decisão de ninguém — era a indentação de um arquivo mandando na
ordem da capa.

**O que mudou.** As oito peças passaram a devolver `null` de verdade, `insumos` ganhou
a condição que faltava, e a semana virou peça própria no catálogo.

**A regra que fica:** uma peça que devolve invólucro em vez de `null` está mentindo
sobre existir, e a mentira fica invisível enquanto o casco for o nada. Antes de trocar
o casco de qualquer coisa, confira o que o casco antigo estava escondendo.

## 2026-09-06 — o ponto de extensão convida ao defeito que ele torna fácil

**O que apareceu.** Para a peça de uma pele poder dizer "não tenho o que dizer", ela
passou a receber o próprio casco (`Casca`) e vesti-lo por dentro. A forma óbvia de
montar esse casco é criá-lo no lugar em que se sabe o `id` — dentro do render:

```tsx
const Casca = ({ children }) => <Bloco id={qual}>{children}</Bloco>;
```

Isso funciona, compila, passa em tudo, e **desmonta a árvore inteira a cada
renderização**: componente criado dentro do render é um TIPO novo toda vez, e o React
não reconcilia dois tipos diferentes — ele joga fora e remonta. Na tela: as colunas da
semana recomeçando a animação a cada toque em qualquer lugar da capa.

**Por que importa.** O defeito não existia antes do ponto de extensão, e não é culpa de
quem o escreveu: **injetar componente é a coisa que o contrato pede**, e a maneira
natural de produzir um componente ali dentro é a errada. Um ponto de extensão não é
neutro — ele torna algumas coisas fáceis, e as fáceis são as que vão acontecer. A
terceira pele vai escrever exatamente esta linha.

**O que mudou.** O casco de cada peça é montado uma vez, num `useMemo` sobre a
vestimenta — que vem do registro e não muda. O comentário no lugar diz o porquê, porque
é ali que a próxima pessoa vai olhar.

**A regra que fica:** ao abrir um ponto de extensão, escreva também qual é o jeito
errado que ele torna conveniente. Contrato que só diz o que aceitar deixa o resto por
conta da sorte de quem chega depois.

## 2026-09-06 — o domingo é um dia de teste, e nenhum teste tinha rodado num

**O que apareceu.** Uma checagem do navegador ficou vermelha sozinha, sem eu ter
mexido nela: *"a manchete da capa é o que saiu do tacho"*. A leitura fácil era
regressão minha. Não era — era domingo.

Puxando o fio, três coisas apareceram, e nenhuma é do teste:

1. **`everMade` não queria dizer "já produziu".** Queria dizer *"produziu hoje ou no
   mesmo dia da semana passada"*. O simulador deixa o domingo quieto de propósito
   ("uma semana em que todo dia é igual ensina a comparar ruído com ruído"), e uma
   fábrica de verdade para pelo mesmo motivo — então as duas pontas dão zero e a capa
   perde o diagrama da comparação, a conta por extenso e os selos do Orgânico. Três
   meses de razão no banco, e a tela abria como se fosse o primeiro dia.
2. **A conta por extenso chamava isso de primeiro dia**: *"0 − 511 = −511 · primeiro
   dia com produção registrada"*, com as quinhentas de ontem na linha logo acima.
3. **A checagem não sabia que dia era.** Cobrava "fez N unidades" todo dia.

**Por que importa.** O defeito não é o domingo: é que **a capa fica mais pobre
exatamente no dia em que ela é mais necessária**. Segunda de manhã, a pergunta do dono
não é "quanto saiu hoje" — é "como foi a semana", e era essa a parte que sumia. Um
número sozinho, sem a comparação, é o que a Lei 3 proíbe, e ele estava sozinho um dia
em cada sete sem ninguém notar.

E a forma do erro se repete: **um nome que descreve a resposta de um caso particular e
é lido como a pergunta geral.** `everMade` lia como "alguma vez"; `mathNoBase` lia como
"não há base". Os dois estavam certos no dia em que foram escritos — uma quarta-feira.

**O que mudou.** `everMade` passou a ler a semana inteira (a MESMA conta que desenha a
régua logo abaixo, para a tela não afirmar duas coisas diferentes); "primeiro dia" só
vale quando os seis dias anteriores estão vazios e hoje não; e a checagem sabe que dia
é, pela mesma regra do simulador, cobrando a frase daquele dia — inclusive que a capa
não chame de primeiro dia uma fábrica com três meses de história.

**A regra que fica:** uma suíte que só roda em dias úteis testa seis sétimos do
produto. Quando um teste ficar vermelho sem que nada tenha mudado, **a primeira
pergunta é que dia é hoje** — e o achado provavelmente não está no teste.

## 2026-09-06 — largura se prova no navegador; densidade, só no aparelho

**O que apareceu.** Precisava ver a capa nova a 800 dp, que é a largura do tablet do
dono. O reflexo foi o certo pela regra da casa — *"o que prova tela é a foto do
emulador"* — e me custou vinte minutos: subir o emulador por software leva sete
minutos, o `system_server` mais alguns, o Metro tem que servir o pacote, e nesta rodada
o gerenciador de atividades nem chegou a responder.

A resposta veio em dois minutos por outro caminho: `npm run shot -- --largura 800`, que
já existia e eu tinha esquecido.

**Por que importa.** A regra "verde não prova tela" está certa e não vai mudar — mas ela
foi escrita contra um defeito específico: **contraste ilegível**, que é cor, e cor no
navegador mente. Reflow não é cor. A pergunta "isto vira duas colunas a 840 dp?" é
decidida pela **largura em dp**, e 800 CSS px num navegador é 800 dp — a mesma conta que
o layout faz.

Então a regra tem duas metades, e eu vinha usando só a mais cara:

| a pergunta é sobre | prova no |
|---|---|
| reflow, quebra de linha, ordem, o que cabe | **navegador**, com `--largura` |
| cor, contraste, toque, fonte do sistema, densidade | **aparelho**, sem substituto |

**O que mudou.** Fotografei a 800 dp e a foto pagou na hora: três defeitos, e dois deles
eram do Papel também — a coluna do texto do herói colada na borda enquanto os cartões
começavam 260 dp adentro, o "↑ +0" com seta verde num empate, e "que na **dom** passada"
(cinco dias da semana são femininos em português e dois não são — a capa escrevia errado
dois dias por semana desde que o selo existe).

**A regra que fica:** antes de subir o emulador, pergunte se a dúvida é de **cor ou de
largura**. Se for de largura, o navegador responde em dois minutos e responde igual. O
emulador é para o que só ele sabe — e continua sendo obrigatório para isso.

## 2026-09-06 — o roadmap dizia que faltava a tela, e a tela estava pronta

**O que apareceu.** Fui pegar o próximo item da lista — F3.2, *"Lojas e clientes com
ficha de acordo. A migração já criou a forma; falta a tela"* — e antes de escrever a
tela fui ver o que existia. Existia tudo: `app/places.tsx:641` edita e **grava** os três
campos, e o acordo já é usado em três lugares (o pedido nasce na data combinada, a lista
mostra a próxima entrega, a capa monta "quem recebe hoje"). A fila também o carrega.

Conferindo os outros seis da mesma seção, mais dois estavam adiantados em relação ao que
a lista dizia: `pickingFor` **já tem chamador** (`app/transfer.tsx:172`), e a devolução
tem movimento com tipo próprio **e tela** — o que falta ali é só o motivo.

**Por que importa.** O `CLAUDE.md` diz que quando um trabalho fecha a pergunta não é
"tem mais alguma coisa?", é **qual é a próxima, e ela está escrita no roadmap**. Então o
roadmap não é documentação: é a entrada da próxima rodada. Uma linha que diz "falta X"
quando X existe não é imprecisão — é **trabalho duplicado agendado**. Eu ia escrever uma
tela que já estava lá, e teria escrito, porque a lista é justamente a coisa em que se
confia para não ter que reconferir.

E a causa é conhecida e tem nome nesta casa: **rótulo que discorda do que está embaixo
dele**. A varredura de 4 de setembro caçou trinta e uma dessas dentro do código. Esta é
a mesma espécie fora dele — e mais cara, porque o código tem compilador e a lista não.

**O que mudou.** Os três itens corrigidos no `docs/roadmap.md`, cada um com
`arquivo:linha` do que existe e uma frase do que realmente falta (preço combinado na
ficha; a tela de conferir item a item; o motivo da devolução).

**A regra que fica:** antes de construir o próximo item da lista, **meça o item**. A
regra de fechamento já existe — *"item fechado sai do roadmap no mesmo commit que o
fecha"* — e ela só funciona se alguém a cumprir toda vez; a leitura é a rede que pega o
que escapou. Custa dois minutos de `grep` e paga uma tela inteira.

## 2026-09-06 — o estudo que eu mesmo escrevi de manhã estava errado à tarde

**O que apareceu.** O roadmap mandava construir a camada 1 do login — a grade de nomes
com PIN, quem está com o aparelho — e dizia, com todas as letras, que ela **não depende
do servidor**. Quem tinha escrito isso quatro horas antes era eu, no `docs/estudo-conta.md`.

Antes de escrever a primeira linha fui medir. `movements.operator_id` é
`uuid references memberships(id)`, e `memberships.user_id` é
`not null references auth.users(id)`. O aparelho não pode criar `auth.users`, logo não
pode criar membership, logo **não pode inventar o id de um operador**.

E o id inventado não ficaria quieto: `operator_id` está na lista fechada de colunas que a
fila envia e viaja tal e qual. No dia em que a sincronia existisse, o primeiro movimento
com um id local seria recusado por chave estrangeira, e o motor **para a fila no primeiro
buraco de propósito** — tudo o que fosse gravado depois ficaria preso atrás dele. É o
mesmo defeito crítico que esta branch já consertou uma vez.

**Por que importa.** O erro tinha a forma mais cara que um erro pode ter aqui: **ele
funcionaria.** A grade abriria, o PIN validaria, a foto no emulador ficaria bonita, a
barra ficaria verde — e o defeito só apareceria meses depois, com a fila travada e a
causa três commits abaixo do horizonte de quem fosse investigar. Nenhum teste desta casa
o pegaria, porque não há servidor contra o que rodar.

E o estudo não foi displicente: ele listou o que existe, separou as camadas certo, e
citou o `operator_id` como prova de que a camada 1 estava pronta para ser preenchida. O
que ele não fez foi **seguir a referência até o fim** — parou em "a coluna existe" e não
perguntou "existe apontando para quê".

**O que mudou.** O estudo foi corrigido no lugar, com a medida e o `arquivo:linha`; o
roadmap trocou o item 2 de "próximo" para "travado, decisão de faseamento do dono", com
três saídas e a que eu recomendo; e o item 3 passou a ser o que de fato não esbarra nisso.

**A regra que fica:** documento que eu escrevo não é medida, é hipótese com a minha
assinatura — e a assinatura não a torna verdadeira. **Uma coluna existir não é a mesma
coisa que ela poder ser preenchida**: siga a referência até o fim (`REFERENCES` de quê,
com que `NOT NULL` do outro lado) antes de tratar o campo como pronto. E a hora de fazer
isso é antes da primeira linha de código, que foi a única coisa que deu certo aqui.

## 2026-09-06 — o portão disse ❌ e o push saiu no mesmo comando

**O que apareceu.** Rodei `bash .proofgate/verify.sh | grep -E "..." && git push`. O
portão imprimiu **"❌ GATE FAILED: 1 item(s). The delivery is NOT done."** e o push saiu
do mesmo jeito, com uma suíte vermelha. O CI ficou vermelho atrás.

O `&&` não estava lendo o veredito: quem governava era o **código de saída do `grep`**,
que achou a linha que procurava e por isso teve sucesso. O portão falhou, o cano teve
êxito, e o `&&` obedeceu ao cano.

**Por que importa.** O defeito não foi não ter olhado — **eu olhei**, e a saída estava na
tela ao lado do push que já tinha acontecido. Encadear é que estava errado: a leitura tem
que caber ENTRE a verificação e a ação, e num `&&` não cabe. É a mesma família da
cicatriz do `pkill` e do laço que esperava a si mesmo — comandos em que a forma escrita
promete uma coisa e a máquina faz outra, e a diferença só aparece quando dá errado.

E tem um agravante que vale nomear: **o `pushGuard` da proofgate cobria exatamente
isto**, e está desligado por decisão do dono de 5 de setembro, com motivo escrito no
`proofgate.json` — com a barra proporcional, ele bloqueava commit de ambiente e de
documento. A decisão continua certa. O que faltava era a rede mais estreita.

**O que mudou.** Regra 5 do `sem-espera.sh`: comando que tem verificação (`verify.sh`,
`npm test`, `typecheck`, `lint`, `e2e`, `db:verify`, `mutate`) **e** `git push` na mesma
linha é recusado, com a instrução de rodar, ler e empurrar em três atos. Prova positiva e
negativa em `src/hooks.test.ts`: três encadeamentos recusados e cinco comandos legítimos
passando, incluindo `git add && git commit && git push`, que não tem veredito para
ignorar.

**A regra que fica:** `&&` encadeia códigos de saída, não conclusões — e assim que entra
um `|` no meio, o código de saída deixa de ser o de quem você acha que é. Verificação e
ação irreversível não cabem no mesmo comando; o que cabe entre elas é você lendo.

## 2026-09-06 — a bateria pesada rodava inteira a cada commit meu, num PR rascunho

**O que apareceu.** Cinco jobs do CI voltaram como falha **em um segundo cada**, sem
log nenhum para baixar. Job que falha em um segundo e não tem log não rodou: ele nem
chegou a um runner.

Não consigo ler o faturamento da conta pelas ferramentas que tenho, então não afirmo a
causa. O que dá para medir é o consumo, e ele é indefensável: a condição da bateria
pesada era *"PR cuja base é `main`"* — e um PR de trabalho tem a base `main` desde o
primeiro commit. Então **cada push meu disparava mutação (16 min), navegador (11 min),
banco e portão**. Numa manhã de doze pushes são mais de três horas de runner para provar
doze vezes a mesma coisa. O dono já tinha dito, com todas as letras: *"cuidado para nao
queimar todos os creditos"*.

**Por que importa.** A regra da barra proporcional (decisão do dono, 5 de setembro) diz
que a bateria inteira roda **"ao fechar uma etapa, ao abrir PR para `main`"** — e eu a
tinha traduzido para YAML como "todo push num PR aberto para main", que é uma coisa
completamente diferente. A tradução parecia fiel e multiplicava o custo por doze.

E o defeito se esconde bem: cada execução individual é verde e correta. Nada num
relatório aponta para "isto está caro"; só a soma aponta, e ninguém soma.

**O que mudou.** A pesada não roda em **PR rascunho**. Rascunho é a palavra que o próprio
GitHub tem para "ainda estou trabalhando", e ela volta sozinha no instante em que o PR é
marcado como pronto para revisão — que é exatamente o momento que a decisão do dono
descreve. `ready_for_review` entrou na lista de eventos, senão sair de rascunho não
dispararia nada. A rápida (tipos, lint, teste, pacote) continua em todo push: custa dois
minutos e é a que pega o erro enquanto ele ainda é barato.

**A regra que fica:** ao traduzir uma regra de processo para uma condição de CI, escreva
ao lado **quantas vezes por dia ela vai disparar**. "Ao abrir PR" e "em todo push a um PR
aberto" são a mesma frase em português e diferem por um fator de doze na fatura.

## 2026-09-06 — a reserva existe onde se promete e some onde a carga sai

**O que apareceu.** Continuando a leitura da lista da F3 — a mesma que já tinha mostrado
um item pronto e dois adiantados —, o item 3 dizia *"a reserva é a camada por cima:
separar do saldo o que já tem dono"*, como se nada existisse. Metade existe.

`stockAgainstOrders` soma o que os pedidos em aberto pediram contra o que há em mãos, e
a tela de anotar pedido recusa prometer mais do que `onHand − requested` — contando até
as linhas ainda não salvas do próprio rascunho, para a segunda linha não prometer as
caixas da primeira. É um cuidado fino.

**E a tela de transferir não conhece nada disso.** O único limite ali é o saldo FÍSICO da
sala. Loja A pede 500 para sexta, o estoque tem 600, e a carga de hoje para a Loja B pode
levar as 600. O sistema disse "reservado" na hora de prometer e ficou calado na hora de
carregar o caminhão.

**Por que importa.** Uma reserva que só uma tela honra não é uma reserva — é uma frase. E
a metade que falta é exatamente a do instante em que a promessa se perde: prometer é
barato e reversível; despachar é o que esvazia a câmara. A metade construída é a que
protege menos.

E o defeito é invisível das duas pontas: a tela de pedido está certa e completa; a de
transferência está certa dentro do que ela sabe. **Nenhum arquivo está errado sozinho** —
o que falta é uma conversa entre dois que não se conhecem. Foi por isso que a lista podia
dizer "não existe" enquanto metade existia: quem olhou o pedido viu pronto, quem olhou a
transferência não viu o assunto.

**O que mudou.** O item 3 do roadmap passou a descrever as duas metades com
`arquivo:linha`, e a que falta com o conserto certo — que **não é bloquear**: a casa
sugere e nunca decide calada, e às vezes a loja está na porta e a carga sai mesmo assim.
O que falta é a tela dizer, na hora, quanto daquilo tem dono e de quem.

**A regra que fica:** quando uma regra vale numa tela, pergunte **em que outra tela ela
poderia ser violada** — e vá olhar essa. Regra que mora num lugar só protege esse lugar,
e a lista de tarefas não distingue "não construído" de "construído pela metade", porque
quem escreve a lista olhou a metade que existe.

---

## 2026-09-06 — o que faltava na separação não era a tela: era saber o que ela grava

**O que se viu.** Fui construir a tela de conferir item a item da separação — a última que
o roadmap descrevia como "só falta a tela" — e todas as peças estavam mesmo prontas:
`pickingFor` responde a conta e já tem chamador, `Item.packaging` traz a hierarquia que o
`UnitStepper` pede, o dicionário do stepper existe nos três idiomas. Faltava desenhar, e
nada mais.

Só que o próprio `pickingFor` já tinha respondido a pergunta que eu ia fazer, no docblock
dele: *"A lista NÃO reserva nada e não escreve no livro-razão… A carga continua sendo o
único evento que move estoque."* Está certo — separar é montar um carrinho **dentro** da
fábrica, e nada saiu de lugar nenhum.

E é aí que a tela morre. Uma conferência item a item que não grava nada é uma lista que
**zera quando o celular bloqueia**, na câmara fria, com a pessoa de luva no meio das
caixas. Isso não é uma tela pela metade: é pior que não ter tela, porque ela promete
guardar a contagem e não guarda.

**Por que importa.** O portão P1 pergunta quem chama, e o P3 pergunta se conserta com um
commit — mas nenhum dos dois pega este caso, porque o problema não é chamador nem esquema:
é que **a tela existe entre dois estados e nenhum é dela**. Antes dela o pedido é demanda;
depois dela a carga é movimento. O carrinho no meio não tem casa, e escolher a casa é
decisão de dono (o que a fábrica promete quando diz "separado"), não de quem desenha.

O que engana é que a pergunta não aparece na lista de peças. Toda peça estava pronta, e a
lista de peças prontas parecia uma lista de tela pronta. **Item de roadmap descreve o que
falta construir, e é cego para o que falta decidir** — e as duas coisas somem no mesmo
"falta a tela".

**O que mudou.** O item 4 do roadmap passou a dizer o que realmente bloqueia, com a frase
do `pickingFor` citada, e a nomear que é a mesma pergunta do item 5: *"separado"* é o
primeiro dos quatro postos de controle, então as duas entram juntas ou nenhuma entra
direito. Ficou registrada também a forma mais barata, para quem decidir não começar do
zero: o carrinho é físico e local, então o estado dele pode morar no **aparelho**
(`app_meta`, como a ordem da capa) e não no livro-razão — nada sobe, nada trava fila, e a
conferência sobrevive à tela apagando.

**A regra que fica:** antes de desenhar uma tela, pergunte **o que ela grava**. Se a
resposta for "nada", ela é leitura — e leitura não pede conferência. Se a resposta for
"não sei", o que falta não é desenho.

---

## 2026-09-06 — a variável que já estava ali era a errada, e tinha o nome certo

**O que se viu.** Ao construir o aviso de reserva na tela de transferência, o número
para comparar estava a duas linhas de distância: `line.baseUnits`, o saldo da sala de
onde a carga sai. É o que a linha de cima já usa (`over = amount > line.baseUnits`), tem
o nome certo — é *o saldo* — e teria compilado, passado no lint e dado verde na suíte.

E teria mentido em toda carga de uma fábrica de picolés. Porque a promessa é da EMPRESA
e o saldo dela está espalhado: produz-se no chão de fábrica e manda-se para a câmara fria
no dia seguinte, que é o que uma fábrica de picolés faz. Com 500 reservadas na câmara e
600 no freezer da frente, comparar com a sala de origem diria "estas 600 têm dono" e o
aviso apareceria contra uma carga que não quebra promessa nenhuma.

**Por que importa.** É o mesmo defeito que já tinha custado um achado de auditoria no
`stockAgainstOrders` — ele lia o `defaultLocationId`, uma sala só, e passava a dizer que
não havia nada para prometer com o freezer cheio. O defeito não voltou por descuido:
voltou porque o código novo nasceu **ao lado** de uma variável que responde à outra
pergunta com a mesma palavra. Existem dois limites nesta tela, os dois se chamam "saldo",
e um é físico (o que cabe no caminhão) e o outro é combinado (o que tem dono). Trocá-los
não quebra nada visível — produz um alerta que aparece sem motivo, e alerta assim ensina
a ignorar alerta, que é a Lei 7 sendo desfeita por dentro.

**O que salvou foi régua compartilhada com teste, não atenção.** `INTERNAL_PLACE_KINDS`
já existia em `src/domain/ledger.ts`, e `src/layers.test.ts:395` já recusava o SQL e a
constante discordarem sobre quais salas são nossas. Usar a mesma régua deixou a tela
nova certa **de graça**, e no mesmo instante ligou as duas metades da reserva à mesma
aritmética — que era o defeito de origem: prometer e despachar contavam coisas
diferentes.

**O que mudou.** `freeToShip` (`src/domain/picking.ts`) compara com a soma das salas
internas, com o motivo escrito no docblock, e o item 3 do roadmap fechou. Os testes
cobrem o caso que decide o desenho — os MESMOS dados dando resultado diferente conforme
o destino —, porque o pedido do destino não é concorrente: mandar para a Loja A é o que a
promessa da Loja A pede.

**A regra que fica:** quando o número que você precisa já está em escopo, desconfie
exatamente por isso. Pergunte de que pergunta aquele número é a resposta — e se a sua
pergunta é outra, ele é a armadilha mais bem colocada do arquivo.

---

## 2026-09-06 — três itens do roadmap eram uma pergunta só, e ela tem prazo

**O que se viu.** A lista tratava separação (4), os quatro postos de controle (5) e o
app do entregador (6) como três construções. Lendo o que cada posto **grava**, eles são
uma coisa só:

- **conferido** existe inteiro — `recordCheck`, tela na aba de transporte, linha própria
  no razão e até migração dedicada (0017) para poder gravar "conferi e bateu" como zero;
- **carregado** e **entregue** são o **mesmo evento**: a transferência escreve as duas
  pernas no mesmo instante, na fábrica;
- **separado** não tem onde morar, que é o achado da manhã.

Então não faltam quatro postos. Falta **uma decisão**: a carga é um evento só ou é uma
viagem com linha do tempo? E o app do entregador é consequência dela, não item próprio —
com a carga atômica, o entregador não tem o que gravar que a fábrica já não grave; a tela
dele seria a mesma lista noutro telefone.

**Por que importa, e por que agora.** O `src/domain/ledger.ts` escreve, sobre outro
assunto, a frase que decide este: *"a única janela em que o vocabulário de um razão é
livre para mudar"* é enquanto não há linha gravada com ele. Dividir carregado de entregue
provavelmente acrescenta tipo ao razão, e o preço disso sobe no dia em que a primeira
fábrica gravar movimento de verdade. É a rara dívida que fica **mais cara com o tempo**
sem ninguém tocar nela.

**O que engana.** Uma lista de tarefas é uma lista de coisas para construir, e por isso
ela descreve tudo como construção — inclusive o que é pergunta. Três itens diferentes
esconderam que a resposta é uma, e cada um sozinho parecia trabalho de um dia. Foi a
terceira vez hoje que medir antes de construir mudou o item, e as três tinham a mesma
forma: **o roadmap sabia o que falta fazer e não sabia o que falta decidir.**

**O que mudou.** Os itens 5 e 6 foram reescritos com a tabela do que cada posto grava e
com a pergunta dita por extenso, marcada como P3 e com o prazo nomeado. O item 6 passou a
dizer que existe *se e só se* a decisão do 5 for pela viagem.

**A regra que fica:** quando dois itens da lista travam pelo mesmo motivo, eles não são
dois itens. Some-os antes de estimar qualquer um dos dois — senão a lista promete três
semanas de trabalho onde há uma conversa de dez minutos com quem decide.

---

## 2026-09-06 — unir duas metades e deixar os termos diferentes

**O que se viu.** Uma hora depois de ligar as duas metades da reserva — prometer e
despachar passaram a contar a mesma coisa —, a pergunta óbvia ainda não tinha sido feita:
*contar a mesma coisa como?* A tela de transferência já lia pedido com um horizonte de
sete dias para montar o palpite (`pickingFor`), e o aviso novo lia **todos os pedidos, sem
data de corte**. Um pedido para daqui a cinco semanas disparava alarme sobre o caminhão de
hoje.

**Por que importa.** O defeito não é aritmético: é de ruído, e ruído é o jeito mais
eficiente de desligar um alerta que funciona. A fábrica produz de novo antes de outubro,
então não há nada a evitar — e quem vê o aviso aparecer sem motivo aprende, em duas
semanas, a passar por ele sem ler. Foi a Lei 7 sendo desfeita por dentro pela feature que
existe para servi-la.

E o mais desconfortável: a tela ficou com **dois conjuntos de pedidos ao mesmo tempo** —
um para sugerir o número, outro para avisar sobre o número sugerido. É a mesma
inconsistência que eu tinha acabado de consertar entre duas telas, reaparecida dentro de
uma.

**O que mudou.** `freeToShip` passou a receber `through`, a tela calcula o horizonte uma
vez só e passa para os dois usos, e o teste cobre a borda (no dia exato do corte o pedido
ainda disputa) e a letra miúda (pedido sem dia marcado conta sempre).

**A regra que fica:** quando duas coisas passam a concordar, confira em **quantos termos**
elas concordam. "Agora as duas leem pedido" é meia verificação — a outra metade é *quais*
pedidos, em que janela, com qual regra para o que não tem data. A concordância que só vale
no verbo é a que passa despercebida, porque a frase que descreve o conserto continua
verdadeira.

---

## 2026-09-06 — o tipo dizia "e ainda não recebeu", e a conta não descontava nada

**O que se viu.** `PickLine` abre com uma frase que é um contrato:
*"O que uma loja pediu e ainda não recebeu: a lista de separação."* O campo `ordered`
somava os pedidos em aberto e **não descontava nada** do que já tinha chegado lá. Depois
de mandar 300 de um pedido de 500, a tela oferecia 500 de novo — e quem confia no campo
manda 800 contra um pedido de 500.

**O que torna isso grave é que o sistema já sabia.** O `ordersCoveredBy` fecha pedido pelo
DIA e não pela carga, com o motivo escrito no docblock: *"quem carrega o caminhão faz duas
viagens até o freezer"*. Uma função conhecia a segunda viagem e a vizinha, na mesma tela,
não. O fato estava no repositório; faltava alguém usar.

**Por que importa.** Nenhum teste podia pegar isso: a suíte exercitava a primeira viagem,
onde as duas contas dão o mesmo número — o formato exato do teste que passa por acidente
que este projeto caça. E o defeito é do tipo que só aparece com uso real, porque exige
duas ações seguidas no mesmo dia.

**O que mudou.** O SQL passou a devolver `sentToday` **ao lado** de `ordered`, não
descontado dele: a subtração é regra e foi para `pickSuggestion`, onde o `mutate` alcança,
e a tela ganhou os dois números para poder dizer *"pedido 500 — já foram 300 hoje"* em vez
de mostrar 200 sem explicar de onde saiu (Lei 3: nenhum número aparece sozinho). O
`sentToday` soma transferência e devolução no mesmo saco, porque 300 que chegaram e 40 que
voltaram são 260 recebidos — e a prova disso roda contra SQLite de verdade, não contra uma
maquete.

**A regra que fica:** a frase do docblock de um tipo é uma **afirmação testável**, não
decoração. Quando ela diz "e ainda não recebeu", vá ver se alguma linha subtrai alguma
coisa. Foi a segunda vez em uma hora que perguntar *"o que mais esta tela conta?"* achou
um defeito — a primeira foi o horizonte. A pergunta é barata e não tem fundo.

---

## 2026-09-06 — o código impresso era um endereço que não existia

**O que se viu.** A etiqueta do lote imprime o QR e, embaixo dele, os onze caracteres do
código — com uma frase própria explicando por quê: *"quando a etiqueta congela ou
descasca, alguém digita os onze caracteres e a conferência segue"*. Só que `findLot`
procurava **por id**, e o QR carrega o **código**. Ninguém podia digitar coisa nenhuma: não
havia campo, e se houvesse a consulta não acharia.

Duas peças perfeitas, cada uma certa por dentro, e nenhuma ligação entre elas. O QR estava
impresso havia semanas apontando para um endereço que o aplicativo não sabia abrir.

**Por que importa.** É a mesma forma do achado da reserva, hoje de manhã: *nenhum arquivo
está errado sozinho*. A tela da etiqueta faz o que promete; o `findLot` responde
corretamente o que lhe perguntam. O que falta é a conversa entre os dois — e a lista de
tarefas dizia só "falta quem o leia", que se lê como "falta uma tela de câmera" e esconde
que a metade barata (digitar) também não existia.

O comentário do cartão de lotes da aba de produção já tinha escrito a necessidade, com
todas as letras: *"quem procura o lote de uma caixa procura HORAS depois, não no segundo
seguinte."* O cartão lista os lotes do DIA. Três dias depois, não havia caminho nenhum — e
a frase que descrevia o problema estava a dez linhas do código que o causava.

**O que mudou.** `findLot` aceita id ou código (uuid e `AAAAMMDD-NN` não se confundem), a
aba de produção ganhou o campo, e a navegação não confere nada antes: a etiqueta já sabe
dizer "esse lote não está mais aqui" com a porta de volta, e duplicar a checagem seria dois
lugares dizendo o mesmo com um deles envelhecendo. Sem exigir formato, porque o `lotCode`
diz por escrito que `AAAAMMDD-NN` é o padrão e não a única forma.

**A regra que fica:** quando um dado é IMPRESSO — etiqueta, QR, código lido em voz alta ao
telefone —, ele virou endereço público. Pergunte quem sabe resolvê-lo de volta. Um
identificador que sai no papel e não entra pelo teclado é uma porta pintada na parede.

---

## 2026-09-06 — a coluna dizia que operar exige ter login

**O que se viu.** Fui construir a camada de gente que o dono pediu e o esquema já tinha
uma resposta pronta — errada. A `0014` criou `movements.operator_id` referenciando
`memberships(id)`, e `memberships.user_id` é `not null references auth.users(id)`. Lido
junto: **toda pessoa que o sistema consegue nomear precisa de uma conta de autenticação.**

O desconfortável é que a própria `0014` cita, no topo, a decisão que ela contraria: *"o
login autentica o sistema, não a pessoa"*. Quem entra pela grade de nomes com PIN, de
luva, no celular compartilhado da fábrica, não tem conta nenhuma e nunca vai ter. A
migração escreveu a decisão certa no comentário e a decisão errada no `references`.

E `devices.responsible_id` tinha o mesmo defeito, pelo mesmo motivo, com a mesma decisão
escrita ao lado — *"o aparelho aponta para uma pessoa"*.

**Por que ninguém tinha notado.** Porque **nada escreve a coluna**. Ela atravessa a
sincronia, tem índice dedicado, tem comentário no servidor, e nenhum caminho do aparelho
a preenche — `app/(tabs)/more.tsx` até registrava a lacuna com todas as letras, *"coluna
sem tabela de gente atrás"*, como o motivo de a porta "Pessoas" não existir. A
contradição estava documentada dos dois lados e nunca foi executada por ninguém.

**Por que agora era a hora, e não daqui a um mês.** Consertar custou uma migração nova
porque não há um único movimento gravado em servidor nenhum. Com a fábrica rodando, a
mesma correção seria estorno de linha por linha, ou um `operator_id` que aponta para duas
coisas diferentes conforme a data. O `src/domain/ledger.ts` já tinha escrito a regra sobre
outro assunto: *"a única janela em que o vocabulário de um razão é livre para mudar"* é
enquanto não há linha gravada com ele.

**O que mudou.** `people` e `profiles` nos dois lados, as duas colunas reapontadas, e a
décima quinta garantia do `db:verify` cobrando as duas metades contra Postgres: pessoa
existe **sem conta**, e o operador **recusa** um id de membership — que era o único que
passava antes. A checagem 5 foi corrigida junto, porque ela gravava o operador como conta
e teria continuado verde afirmando a semântica antiga.

**A regra que fica:** quando um comentário e uma restrição do esquema discordam, a
restrição é o que roda — e o comentário é a prova de que alguém sabia. Procurar essa
discordância é barato: leia o docblock da migração e depois leia o `references` dela. Se
os dois contassem a mesma história, a migração não precisaria do parágrafo.

---

## 2026-09-06 — o filtro de caminho que não filtra nada num PR

**O que se viu.** Hoje de manhã acrescentei `paths-ignore: ['docs/**', '**/*.md']` aos dois
gatilhos da CI, para commit de documentação não gastar runner — e escrevi no relatório que
isso estava resolvido. À tarde, um commit que tocou **só** `docs/estudo-entrada.md` e
`docs/roadmap.md` disparou a CI do mesmo jeito.

O motivo: num evento de `pull_request`, o GitHub avalia o filtro contra o **diff inteiro do
PR** contra a base, não contra o push que acabou de chegar. Este PR mexe em centenas de
arquivos que não são documentação, então o filtro nunca exclui coisa nenhuma. No gatilho de
`push` ele funciona, porque ali o diff é o do push.

**Por que importa.** O erro não é o desperdício — com a cota morta, hoje não custa nada. É
que eu **afirmei uma economia que não existia**, num relatório sobre custo, para o dono
ler. E a linha continuaria lá para sempre parecendo que protegia: filtro que não filtra é
pior que filtro ausente, porque ninguém volta a olhar.

O mecanismo do engano é específico e vale guardar: **eu li a documentação do gatilho errado**
— `push` e `pull_request` compartilham a palavra `paths-ignore` e não compartilham a
semântica. Duas coisas com o mesmo nome fazendo contas diferentes é o mesmo defeito que
`recorded_by`/`operator_id` custaram uma rodada, e que "saldo da sala" contra "saldo da
empresa" custou outra, hoje mesmo.

**O que mudou.** A linha ficou, porque no `push` ela vale — mas agora carrega a explicação e
a data do commit que provou o contrário. Uma linha de configuração que promete uma coisa e
faz outra tem que dizer isso onde alguém a lê.

**A regra que fica:** economia de CI se afirma **medida**, nunca lida. O que prova que um
filtro filtra é um commit que ele deveria excluir não aparecendo na lista de execuções — e
esse teste custa um push.

---

## 2026-09-06 — a checagem de navegador passou verde nas duas vezes em que a tela estava errada

**O que se viu.** A grade de nomes entrou com `flexBasis: '44%'` e `flexGrow: 1`. Tipos
limpos, lint limpo, e a checagem de navegador **passou** — ela afirma o texto certo: o
nome está lá, o perfil está lá, "Ninguém ainda" está lá. A foto mostrou que, com uma
pessoa cadastrada, a célula esticava para a largura inteira: a grade era uma faixa.

Consertei fatiando as linhas por `dp` (dois nomes no telefone, três no tablet pequeno,
quatro no tablet) com vãos para a última linha não esticar. Rodei de novo, e a foto mostrou
o **segundo** defeito: o vão herdava o estilo do nome, borda inclusive, e desenhava uma
caixa vazia ao lado da Ana. O e2e passou verde nessa também.

**Por que importa.** Já está escrito aqui que "verde não prova tela", e a lição foi
aprendida com 338 testes e 36 checagens de navegador. O que esta rodada acrescenta é mais
específico e mais incômodo:

> **A suíte de navegador prova a CORRENTE, nunca a FORMA.** Ela lê texto do DOM: sabe que a
> tela mudou de estado, que a porta apareceu, que o nome entrou. Não sabe se o nome ocupa
> metade da tela ou a tela inteira, e nunca vai saber — não é limitação de esforço, é o que
> ela mede.

E a segunda metade: **o conserto do primeiro defeito criou o segundo.** Olhar uma vez não
basta quando se mexe em layout; a foto vale por edição, não por tela.

**O que mudou.** A grade fatia por `dp` com o motivo escrito, o vão não se desenha, e as
duas correções carregam a frase "a foto mostrou" no comentário — para o próximo que mexer
ali saber que aquele detalhe não é enfeite, é cicatriz.

**A regra que fica:** depois de mexer em layout, fotografe **de novo**, mesmo que a
verificação continue verde — principalmente se continuar. Verde depois de um conserto de
forma não é confirmação: é a mesma medida de antes, feita outra vez.

---

## 2026-09-06 — o guarda que faltava era o do portão que este projeto mais cita

**O que se viu.** O P1 — *"quem chama isto no mesmo commit?"* — é o primeiro portão deste
repositório e o mais citado. A doença que ele existe para pegar apareceu quatro vezes com
nome e sobrenome: `assistant_phrase`, `Draft.kind`, `balanceAt`, `daysOfCover`.

E não havia guarda nenhum para ele. O dicionário tinha (`src/dictionary.test.ts` recusa
seção sem leitor); o domínio, que é onde as quatro apareceram, não tinha. Medindo com a
régua certa — referência fora de arquivo de teste, contando quem chama de dentro do próprio
arquivo — havia **dez** funções nessa situação.

**Por que importa.** Um portão citado em toda decisão e conferido por nenhum teste é
exatamente o tipo de regra que este projeto já aprendeu a desconfiar: *"documentar a forma
de conferir não é conferir"* está escrito aqui desde 3 de setembro, sobre outra coisa. O
P1 estava sendo cobrado por atenção humana — e atenção humana já falhou quatro vezes no
mesmo repositório, sempre do mesmo jeito.

**O que a medição achou de graça.** `isValidHierarchy` estava no domínio, testada, e
**nada validava hierarquia de embalagem em lugar nenhum**. Um degrau fora de ordem entrava
no banco em silêncio e reapareceria como conversão errada no `UnitStepper`, na mão de quem
conta caixa de luva. Não era código morto: era um guarda desligado da tomada.

**A parte desconfortável do veredito.** Das dez, quatro saíram e sete ficaram registradas —
e escrever sete razões é perigosamente parecido com escrever sete desculpas. O que separa
uma coisa da outra é o teste que eu apliquei em cada uma: *a regra existe e o consumidor é
escopo escrito?* `ratesBefore` passou porque implementa uma regra que o SQL não faz (uma
alta de 9% em dois passos aparecendo como 2%); `priceMove` reprovou porque o SQL faz
exatamente o que ela fazia. Sem esse teste, "fronteira registrada" vira o lugar onde código
morto vai morar.

**O que mudou.** Quatro funções apagadas, uma ligada à tomada, sete registradas com razão,
e um guarda que cobra os dois sentidos: sem chamador reprova, e registro que ganhou chamador
e ficou na lista também reprova.

**A regra que fica:** todo portão que a casa cita numa decisão precisa de um teste que o
cobre. Portão citado e não conferido não é regra — é intenção, e intenção não pega o quinto
caso.

---

## 2026-09-06 — o guarda contra versão repetida tem a entrada escrita à mão, e ela envelheceu

**O que se viu.** Compilei o APK aqui para o dono testar no tablet — a CI não pode, a cota
do GitHub acabou. Antes de entregar, fui conferir a página de releases e achei
`apk-0.11.0` **publicado hoje às 05:43**, antes de tudo o que entrou depois: a reserva no
despacho, a segunda viagem ao freezer, o código impresso, gente e perfil, a grade de nomes,
o movimento dos desenhos.

E o `app.json` continuava em `0.11.0`. O guarda que existe exatamente para impedir isso —
`src/release.test.ts` — passou verde, porque ele compara com `ULTIMO_PUBLICADO`, uma
**constante escrita à mão**, e ela dizia `0.10.0`.

**O que isso teria custado.** O APK que eu ia mandar tem `versionCode 110000`, igual ao que
está no tablet dele. Android não instala: mesmo número, conteúdo diferente, e **o erro no
aparelho não explica nada**. Ele tentaria, falharia e não teria como saber por quê — que é
a cicatriz que este arquivo já tem escrita, de 3 de setembro: *"O release publicava dois
apps com a mesma versão, e um deles era velho."*

**A forma do defeito.** O guarda protege contra "um número que não pode repetir" e depende
de alguém lembrar de atualizar um número à mão. É a mesma falha que ele existe para pegar,
um nível acima — e o docblock dele até explica por que a constante é manual (*"é o número
que está NO APARELHO de alguém, e o repositório não tem como descobri-lo sozinho"*), o que
é verdade e não deixa de ser o buraco.

O ⚠️ da proofgate (*"version bumped, no release in sight"*) roda em toda entrega e eu o
justifiquei o dia inteiro como benigno. Ele olha a direção contrária — bump sem release —
e por isso não pegou esta: release sem bump.

**O que mudou.** `ULTIMO_PUBLICADO` passou a `0.11.0` (fato, está na página de releases) e
o `app.json` foi para `0.12.0`, que é o que o guarda então exige. O APK foi recompilado com
`versionCode 120000`, que o tablet aceita como atualização.

**A regra que fica:** guarda cuja entrada é constante escrita à mão só vale enquanto alguém
lembra — e o momento de esquecer é exatamente o momento em que ela importa, porque é o dia
em que algo foi publicado. Antes de compilar pacote para alguém instalar, **olhe a página
de releases**, não a constante.

---

## 2026-09-06 — o componente tinha teste, tinha docblock, e terminava a conta pela metade

**O que se viu.** O `UnitStepper` foi construído meses atrás, com teste e com um docblock
que diz o que ele existe para fazer: *"The echo is the whole point: it removes mental
math, which is where miscounts come from."* O dicionário até traz o exemplo:
*"12 engradados = 72 caixas = 3.600 picolés"*.

Ao usá-lo pela primeira vez, na separação, a foto mostrou o eco dizendo **"= 1 engradado"**
— a mesma informação do número grande logo acima. E a linha do pedido, dois centímetros
antes, diz *"faltam 600 un"*. Ou seja: para saber se o que ela contou cobre o pedido, a
pessoa na câmara precisava saber **de cabeça** que um engradado são 300.

Exatamente a conta mental que o componente existe para remover.

**Por que ninguém tinha visto.** Porque ninguém tinha chamado. O `UnitStepper` estava na
lista de fronteiras registradas do dicionário — *"componente da Fase 2, e apontá-lo como
defeito já custou uma rodada"* —, o que estava certo: não era código morto, era escopo
escrito. Mas fronteira registrada não é o mesmo que peça provada.

**E isto é a outra metade do portão P1**, que hoje ganhou guarda por causa das dez funções
do domínio sem chamador. O P1 é lido como uma regra sobre código morto — *"sem chamador,
não entra"* — e ele é mais que isso:

> **Peça sem chamador não é apenas não-usada: é NÃO-VERIFICADA — mesmo com teste verde.**
> O teste prova o que o autor imaginou. O chamador prova o que a tela precisa. São coisas
> diferentes, e a segunda só aparece no dia em que alguém liga o fio.

O teste do stepper exercitava a decomposição e passava; ele nunca perguntou *"isso responde
a pergunta que a tela ao lado está fazendo?"*, porque não havia tela ao lado.

**O que mudou.** O eco fecha a conta: decomposição e, quando o valor não está em
unidade-base, o total nela — `= 1 engradado = 300 unidades`, que é a corrente de igualdades
que o dicionário prometia desde o começo. E o `stepper` saiu da lista de fronteiras, porque
deixou de ser uma.

**A regra que fica:** ao ligar pela primeira vez uma peça que esperava chamador, **olhe a
foto antes de comemorar**. Ela vai estar tecnicamente correta — tem teste — e pode estar
respondendo outra pergunta.

---

## 2026-09-06 — escrevi um vocabulário novo do razão e não o levei ao guarda que existe para isso

**O que se viu.** O `src/sync/agreement.test.ts` existe para uma coisa só: garantir que
palavra que o aparelho grava é palavra que o servidor aceita. Ele nasceu de um defeito real
— o aparelho dizia `internalUse` e o enum do servidor diz `internal_use`, o que o SQLite
aceita, a fila enfileira e o Postgres recusa **meses depois, com ninguém olhando**.

Ele cobre tipo de movimento, motivo de perda, tipo de lugar e capacidade. Fui conferir e
**não cobre `return_reason`** — que eu mesmo criei hoje de manhã, nos dois lados, com
migração, constraint e garantia no `db:verify`. Fiz tudo, menos a linha de dez segundos
neste arquivo. Também não cobria `control_post` nem `item_kind`.

**Por que importa.** O defeito que este guarda pega não aparece em teste, não aparece em
navegador e não aparece na tela: ele aparece na primeira sincronia de verdade, num aparelho
de fábrica, como uma fila que trava. Foi por isso que ele foi escrito. E ele estava
protegendo quatro vocabulários enquanto três passavam ao lado.

**A forma do buraco.** Um guarda por CASO cobre o caso que doeu. O `return_reason` era
vocabulário novo do razão — a mesma espécie de coisa que o guarda existe para vigiar — e
ninguém o levou até lá porque a lista de vocabulários vigiados é escrita à mão, um teste por
enum. Não há nada que diga *"apareceu um enum novo no servidor e ninguém o compara"*.

É a terceira vez hoje que a mesma forma aparece: guarda cuja entrada é escrita à mão
envelhece em silêncio — o `ULTIMO_PUBLICADO` do release, a direção única do
`columns.test.ts`, e agora esta.

**O que mudou.** Os três entraram, cada um lendo a união do TypeScript em vez de repetir a
lista — assim um valor acrescentado amanhã é conferido sem ninguém lembrar deste arquivo. E
conferi que mordem: troquei `wrong_item` por `wrongItem` no domínio e o teste reprovou com
a frase certa.

**A regra que fica:** vocabulário novo do livro-razão entra em **quatro** lugares no mesmo
commit — domínio, aparelho, servidor e o guarda de acordo. Os três primeiros a tela cobra
na hora; o quarto só cobra na fábrica de alguém.

---

## O portão que eu escrevi envenenava o livro-razão — e só a refutação viu

**6 de setembro.** Fui construir a decisão escrita do dono — *"aparelho emprestado entra
como produção e nada mais… sem custo, sem preço, sem dinheiro"* —, e a primeira coisa que
achei foi que a fronteira que a impedia tinha caducado. `app/assistant.tsx` dizia
*"until sign-in lands, whoever holds this phone is the owner"*, e estava certo quando foi
escrito. Ontem a grade de nomes entrou: `people.profile_id` aponta para um perfil e o
perfil carrega as capacidades. **A fronteira esperava a CONTA, e o que faltava era a
PESSOA.** Fronteira registrada também envelhece, e envelhece calada — é a quarta vez que
essa forma aparece nesta semana.

Então gatei as oito leituras de dinheiro, mudei treze telas, e a barra ficou verde:
typecheck limpo, lint limpo, 378 testes passando. **E a mudança estava com um defeito
irreversível dentro.**

`recordProduction` e `recordLoss` leem as taxas por `itemCosts` — a mesma função que eu
tinha acabado de gatear. Duas refutações adversariais independentes mediram, rodando o
código: com o portão fechado, a corrida congelava `unit_cost_rate` **nulo** em cada
consumo e **5 onde o dono congelava 304,98**, sobrando só a embalagem. Uma delas foi
adiante e achou o que é pior: a contaminação não fica nas duas funções. `item_costs` é
reescrito a partir do que elas gravam, então transferência e contagem — que leem
`item_costs` cru e estão **certas** — passam a congelar fielmente o número errado. E o
servidor recalcula pela mesma coluna (`0025`), concorda com o aparelho, e a checagem de
divergência do `db:verify` **passa**. Os dois lados de acordo sobre o número errado.

**Por que importa mais que o defeito.** `record_production` e `record_loss` são as
capacidades nº 1 e nº 4 do `operator`: quem está de luva na câmara é exatamente quem
dispara isso. E conteúdo de livro-razão não se corrige — se estorna. Cada corrida e cada
perda lançada com o portão fechado exigiria estorno manual, e nada na tela diria que houve
problema.

**A ironia que mede o tamanho do erro.** O compilador me deu metade da resposta: quando
`listProducts` passou a devolver `unitPackagingRate` nulo, `tsc` acusou a linha do
congelamento, eu criei `listProductsForLedger` e escrevi um docblock parabenizando-me por
ter salvado o palito e o saquinho. **A metade dominante — o custo da receita — estava
quebrada duas linhas acima, e eu não olhei, porque o compilador não podia me cobrar ali:
`Record<string, Rate>` vazio tem o mesmo tipo de um cheio.** Onde o tipo cobra, eu acerto;
onde ele não cobra, eu escrevo um comentário satisfeito.

**O que mudou por causa disso:**

1. **`itemCosts` devolve `null`, não `{}`.** Devolver mapa vazio era o buraco: o motor de
   receita faz `?? 0` por contrato, então `costRecipe({})` dá zero, e **cinco telas
   imprimiam R$ 0,00 por unidade em todo produto**. Nulo devolve a cobrança ao compilador
   — e ele imediatamente apontou as cinco.
2. **A convenção `ForLedger`,** com guarda em `src/layers.test.ts` recusando qualquer
   arquivo fora de `src/data/` e `scripts/` que a mencione. Os docblocks afirmavam esse
   guarda **antes de ele existir** — e docblock que promete uma rede que não está lá é
   pior que docblock nenhum.
3. **O teste GÊMEO, e a ordem entre os dois é o achado.** Eu ia escrever só o de mão única:
   *"veste o perfil operator, prova que nenhuma leitura devolve número"*. Ele passa com o
   razão apodrecido — foi exatamente o que faltou. O gêmeo grava as cinco escritas duas
   vezes, dono e operador, e afirma que a taxa de cada linha é **IGUAL, número por
   número**. Não "não é nulo": `unitCostRate = 5` não é nulo, passa por todos os filtros
   `!== null` que as telas já têm, e chega à capa do dono como figura plausível.

**A regra que fica, e ela é maior que este commit:** quando um portão de LEITURA entra num
lugar que uma ESCRITA também lê, o portão deixa de ser regra de tela e passa a ser
corrupção de dado. A pergunta antes de gatear qualquer leitura é *quem mais chama isto, e
algum deles grava?* — e a prova não é o portão fechar, é o razão sair igual.

## E `git checkout` num arquivo não é desfazer um experimento

Na mesma sessão, para provar que um teste novo mordia, plantei o defeito de volta numa
linha e desfiz com `git checkout src/data/repository.ts`. **Aquele arquivo tinha quinze
edições não commitadas — o coração da mudança — e todas foram embora**, incluindo o
conserto do defeito acima. Reconstruí de cabeça, e deu certo porque as quinze estavam
frescas; meia hora depois não estariam.

`git checkout <arquivo>` não desfaz a última edição: ele **descarta o arquivo inteiro**
contra o índice. Para provar que um guarda morde, o caminho é o mesmo que eu já usava nas
outras cinco provas desta sessão — inverter exatamente a linha que plantei, com o mesmo
`replace` ao contrário — ou commitar antes de experimentar. O que fica escrito, porque
comando destrutivo não se lembra na pressa: **nesta árvore, `git checkout` de arquivo com
mudança não commitada é perda de trabalho, não é `undo`.**

---

## A ferramenta de olhar não alcançava a metade que eu tinha acabado de construir

**6 de setembro, depois do portão do dinheiro.** Treze telas mudadas, barra verde, e eu
ia dizer que estava pronto. A regra da casa é que **verde não prova tela** — o tema claro
ilegível que chegou ao dono passou por 338 testes e 36 checagens de navegador. Então fui
tirar a foto.

E a foto saiu **idêntica à de sempre**. O portão está dormente no padrão: sem ninguém
escolhido, o aparelho é do dono e todos os números aparecem. Ou seja, a metade nova do
aplicativo era exatamente a metade que a ferramenta não sabia alcançar, e tirar a foto
sem pensar teria me dado a confirmação errada com a cara da certa.

A bandeira `--como-operador` dirige o app pelo caminho de uma fábrica — cadastra a
pessoa, liga a chave, toca no nome na grade — em vez de forjar o estado por baixo. E ela
me corrigiu **quatro vezes** antes de me mostrar qualquer tela:

1. *"Compartilhado" não existia na tela* quando eu procurei: aquele cartão só é desenhado
   depois que a empresa nomeia, e eu tinha escrito as duas chaves na ordem inversa. A tela
   estava certa e o roteiro, errado.
2. *Nenhuma foto saía no compartilhado*, e o motivo é desenho, não defeito:
   `app/_layout.tsx` limpa o operador a cada abertura — e para esta ferramenta cada `goto`
   É uma abertura. Fotografa-se a outra configuração, "um por pessoa", em que se escolhe
   uma vez e fica.
3. *Duas execuções ao mesmo tempo* — eu disparei a segunda sem esperar a primeira, e o
   guarda da própria ferramenta me barrou duas vezes. A foto que eu li como "o conserto
   não pegou" era do pacote anterior ao conserto.
4. E quando enfim mostrou: **três defeitos que nenhum teste vê.** Um separador vazio no
   meio de uma linha ("22 un · derreteu ·  · 22/08", o lugar padrão nasce sem nome), um
   cartão repetindo o rótulo da porta logo acima dele, e uma frase sem o respiro que a
   figura que ela substituiu tinha.

**Mas o achado grande a foto deu de graça, e ele não é sobre layout.** A tela de lugares
mostrou "Mercado do Zé — CLIENTE". A fábrica de exemplo CRIA um cliente
(`src/data/simulate.ts:130`), a tela o desenha com glifo e rótulo, o dicionário tem a
palavra nos três idiomas — e `app/places.tsx` oferecia só lugares NOSSOS no cadastro.
**A simulação mostrava ao dono uma coisa que o aplicativo dele não sabia fazer.**

Isso amarra três coisas que pareciam soltas: `movement_kind` tem `sale` desde a fundação
e ninguém escreve; `movements.unit_price_rate` existe desde a `0008` e ninguém escreve;
`customer` existe e nenhuma tela cria. São a MESMA falta — sem cliente não há a quem
vender, e o `moveBetween` já decidiu por escrito que loja própria não é venda. O item
"preço combinado na ficha da loja" que o roadmap pedia não é um campo: é esta peça.

**A regra que fica:** quando uma mudança acrescenta um ESTADO ao aplicativo, a ferramenta
que olha tem de saber chegar nele — senão a foto passa a atestar o estado velho com a
autoridade do novo. E dado semeado e formulário são dois autores da mesma lista: quem
compara os dois é a foto, ou ninguém.

**E aconteceu de novo no mesmo dia, o que mudou a forma do conserto.** Entrou o editor de
preço, que mora atrás de um toque em "Combinar entrega" — e a ferramenta só sabia chegar
por URL. Da primeira vez eu tinha resolvido com uma bandeira para aquele estado; a
ferramenta já tinha DOIS casos assim resolvidos por nome de rota (`receita`, `lote`), e o
terceiro viraria o terceiro `if`. Então virou `--tocar`, com o alvo vindo de fora: meia
tela deste aplicativo mora atrás de um toque, e o caminho do dedo é um argumento, não um
caso especial por tela. **Duas vezes é coincidência; três vezes é assinatura de que a
forma está errada** — e a diferença entre consertar o caso e consertar a forma é que a
segunda não pede que ninguém se lembre dela na quarta vez.

---

## Quatro guardas morderam numa migração só, e nenhum deles é sobre a migração

**6 de setembro, ao entrar as tabelas de preço.** Duas tabelas novas e uma coluna, e
o caminho até verde passou por quatro guardas que já existiam — cada um cobrando uma
coisa que eu não teria lembrado:

1. **`erase.test.ts`**: as tabelas novas não estavam no conjunto de apagar. Sem isso,
   "apagar tudo" bateria na chave estrangeira e a transação voltaria atrás inteira —
   o defeito que esse guarda foi escrito para pegar, em 4 de setembro, repetido por
   mim três dias depois.
2. **`columns.test.ts`**: `items.sale_price_rate` não atravessava a fila. A tela
   escreveria, o teste do repositório passaria, e o dado nunca chegaria ao servidor.
3. **`outbox.test.ts`**: `location_prices` é enfileirada e a varredura de órfãs não a
   conhecia — e é a única tabela deste conjunto que o aplicativo APAGA (tirar o
   acordo de uma loja apaga a linha). A entrada da fila apontaria para uma linha que
   não existe mais, e o motor pararia na primeira subida com tudo preso atrás.
4. **`device-session.ts`**: a sessão que prova a travessia contra Postgres se RECUSOU
   a rodar, porque as tabelas novas não apareciam nela — *"a checagem 6 cobriria menos
   do que promete"*. Um guarda que se recusa a atestar menos do que o nome dele diz.

O padrão vale mais que os quatro: **nenhum deles é sobre preço.** Cada um nasceu de
uma cicatriz de outro assunto e cobrou a mesma forma num assunto novo. É a diferença
entre um teste que confere um caso e um guarda que confere uma REGRA — o primeiro
protege o que já existia, o segundo protege o que ainda vai ser escrito, inclusive
por quem não leu a cicatriz.

E um defeito de verdade veio do teste comum, não do guarda: dois acordos combinados
no mesmo segundo empatam em `observed_at`, e "de quanto veio" saía pela ordem que o
SQLite quisesse. `itemMovements` já desempatava por `rowid` pelo mesmo motivo — a
regra existia no repositório e eu não a levei para a consulta nova.

E o guarda do Postgres achou um quinto, que não é meu e estava lá há dias: a
verificação monta o SQL dentro de uma string de shell entre aspas duplas, e um
comentário ali dizia *"a política ainda exige `manage_company`"* — com crase, que em
shell é substituição de comando. Toda execução imprimia `manage_company: command not
found` dentro de um comentário, sem consequência e sem ninguém olhar.

**E a minha correção reproduziu o defeito um nível acima, na hora.** Escrevi no
comentário novo *imprimindo "manage_company: command not found"* — com aspas duplas,
dentro da mesma string entre aspas duplas. A string fechou ali, e os `grant` que vinham
logo abaixo deixaram de fazer parte do comando: a verificação passou a recusar
`profiles`, uma tabela que eu não tinha tocado. Ou seja, escrevi a explicação do defeito
e a explicação cometeu o defeito.

**Crase é pontuação em Markdown e é execução em shell; aspas são citação em prosa e são
delimitador em shell.** Prosa cuidadosa dentro de uma string de shell é exatamente onde
os dois hábitos colidem — e o sinal de que colidiram não foi um erro de sintaxe, foi uma
tabela vizinha reclamando de permissão. Nesta árvore, comentário dentro de `-c "..."`
escreve-se sem crase e sem aspas, e quem duvidar roda `bash -n`, que não pega nada disto
porque tudo continua sintaticamente válido.

**E o quinto guarda eu escrevi, porque três dos quatro contavam a mesma história.**
A regra que faltava: *uma tabela cuja política no servidor só tem `for insert` nunca
vai ter UPDATE, e a fila que a subir com `on conflict do update` é recusada no plano
— com uma mensagem que fala de permissão, não de política, numa tabela que ninguém
tocou*. O que existia contra isso era uma lista escrita à mão dentro do gerador da
fila. A garantia nova pergunta ao `pg_policies` do banco que acabou de aplicar as
migrações: append-only não é o que eu lembro, é o que a política diz.

E ela achou uma divergência na primeira execução, que eu quase tratei como defeito:
`readings` ganhou política de update na `0031` — escrita quando a fila subia tudo com
DO UPDATE — e hoje o aparelho a sobe uma vez só. Não é defeito: é permissão concedida
a um caminho que o aparelho deixou de usar. Virou registro com motivo escrito, e o
registro se confere contra o sistema, para a exceção que deixar de ser exceção
reprovar em vez de envelhecer calada.

**Uma coisa que eu quase escrevi aqui e não era verdade.** Quebrei um literal de
template com crase dentro de um comentário SQL, e a suíte falhou onde o typecheck
tinha passado. Ia registrar como divergência entre `tsc` e `esbuild` — soava bom, e
seria um achado. Fui conferir com um arquivo de três linhas: `tsc` pega, e o que
tinha acontecido é que eu não rodei o typecheck depois daquela edição. Alarme
inventado ensina a ignorar alarme, e a diferença entre insight e história bonita é
justamente o arquivo de três linhas.

---

## O teste que eu ia entregar como prova passava por causa do estoque da fábrica

**6 de setembro.** Escrevi uma checagem de ponta a ponta para provar que o preço
digitado na ficha da loja chega ao banco e volta: digita `2,50`, salva, recarrega,
`assert.match(screen(page), /2,50/)`. Passou de primeira. Ia commitar.

O teste de mordida — desligar a gravação e conferir que fica vermelho — derrubou:
**com a gravação desligada ela continuava verde.** O que ela casava era `R$ 1.932,50`,
o valor do estoque da fábrica, num cartão mais abaixo da mesma página.

A causa é mecânica e vale para a suíte inteira: `screen()` lê `body.innerText`, que é
o texto do DOCUMENTO. O que está dentro de um campo é `value`, um atributo — não
aparece ali nunca. Então toda asserção sobre o que um campo guarda, escrita com
`screen()`, ou casa outra coisa na página ou não casa nada. **A primeira é pior,
porque fica verde**, e uma regex de quatro caracteres numa página cheia de dinheiro
casa quase sempre.

Trocada por `inputValue()`, a checagem virou prova — e imediatamente achou um defeito
de verdade que a versão falsa nunca acharia: o preço voltava como **`2,5`** e não
`2,50`. `formatTyped` tem máximo de casas e não tinha mínimo, então dinheiro
pré-carregado num campo saía sem os centavos. O mesmo valia para o campo de preço da
compra, que trazia `118` onde a nota dizia R$ 118,00 — consertados os dois, porque a
mesma cifra escrita de dois jeitos no mesmo aplicativo é pior que qualquer um deles.

**Três coisas ficam, e a terceira é a que muda o método:**

1. Asserção sobre campo se faz com `inputValue()`. Está escrito no docblock do
   `screen()`, onde quem for escrever a próxima passa.
2. E não só escrito: uma checagem nova preenche um campo com um nonce e afirma que o
   texto da tela **não** o contém. O comentário depende de alguém ler; a checagem
   reprova sozinha se `innerText` mudar de comportamento.
3. **O teste de mordida não é cerimônia — é o único lugar onde este defeito aparece.**
   A checagem estava verde, o código estava certo, e a barra inteira concordava. O que
   separou "passa" de "prova" foi desligar a coisa que ela dizia estar provando. Nesta
   sessão o mesmo gesto salvou duas vezes: aqui, e no teste gêmeo do livro-razão, onde
   a versão que eu ia escrever sozinho passaria com o razão apodrecido.

E uma quarta, sobre mim: eu já tinha rodado a mordida em cinco guardas nesta sessão e
mesmo assim quase pulei esta, porque a checagem tinha passado *de primeira* — que é
exatamente quando a suspeita deveria subir, não descer. Teste que passa na primeira
tentativa contra código recém-escrito é a situação em que a mordida vale mais.

---

## Escrevi a dívida errada, prescrevi o conserto errado, e só não construí porque conferi a premissa

**6 de setembro.** Fechei uma rodada anunciando qual seria a próxima: *"a configuração da
empresa não atravessa a sincronia — o conserto é uma tabela `companies` no aparelho,
entrando na travessia como qualquer outra"*. Eu mesmo tinha escrito isso no roadmap horas
antes, com convicção e com os números certos ao lado (as três colunas, as três migrações
que as criaram).

Fui construir e conferi a premissa antes da primeira linha. **`Transport` só tem `push`.**
O docblock do motor diz na primeira frase: *"sending what the phone wrote while it was
alone"*. Não existe caminho de descida — e nunca existiu.

Duas coisas caem juntas:

1. **"É a única coisa que dois celulares não combinam"** era falso. Hoje eles não combinam
   nada: a produção que o celular da fábrica grava não desce para o da expedição. A frase
   fazia parecer que tudo mais já concorda e só a configuração ficou de fora — que é o tipo
   de erro que sobrevive porque *soa* específico.
2. **O conserto prescrito não consertaria.** Com travessia só de subida, cada aparelho
   empurraria a própria configuração, o último venceria no servidor, e nenhum aprenderia o
   valor do outro. Eu teria construído a tabela, os testes ficariam verdes, a barra inteira
   passaria — e a consequência descrita continuaria exatamente igual. **Meio conserto com
   cara de conserto inteiro.**

**O que fica de método.** O `CLAUDE.md` diz que contradição achada é suspeita de leitura
errada até virar prova, e eu sempre li isso como uma regra sobre achados de OUTROS lugares
— o esquema, o domínio, o servidor. Aqui a premissa errada era minha, escrita por mim, no
documento que existe justamente para dizer o que fazer em seguida. **A lista escrita não é
mais confiável que a memória só por estar escrita**; ela é mais confiável porque pode ser
conferida, e conferir é um ato, não uma propriedade do arquivo.

O que salvou foi um gesto de trinta segundos: antes de construir o que o plano manda, abrir
o arquivo que o plano pressupõe. Foi o mesmo gesto que hoje já tinha desmentido três coisas
— a fronteira caduca do assistente, o `customer` que a simulação criava e a tela não, e o
teste que passava por causa do estoque da fábrica.

**E há uma consequência real que não é sobre documentação.** O portão do dinheiro que
entrou hoje depende de duas bandeiras que moram só no aparelho. Enquanto não houver
descida, **o portão é por APARELHO** — uma fábrica com dois celulares pode ter um
escondendo custo e o outro não, sem ninguém ter escolhido. Está dito no
`currentCapabilities`, onde quem for mexer nele passa, e não só no plano.

---

## O preço de tabela não tinha tela, e eu tinha escrito o portão P1 no mesmo commit

*6 de setembro.* Fechei o preço de venda com três tabelas, o portão da leitura, o
histórico append-only e a ficha da loja — e no fim, procurando insight, fiz ao meu próprio
commit a pergunta do P1: **quem chama isto?** `saveSalePrice` com `placeId: null`, que é o
caminho do preço de TABELA, tinha dois chamadores: `repository.test.ts` e
`scripts/device-session.ts`. Nenhuma tela. E `canSeePrice` — a capacidade
`view_sale_price`, o portão que eu tinha acabado de desenhar — **não tinha um único
leitor** em `app/`.

Os dois vazios eram o mesmo vazio, e a forma dele explica por que passou: eu construí o
preço **combinado** primeiro, porque foi ele que o dono pediu, e o combinado *vence* a
tabela. Uma peça que serve de piso para outra dá a impressão de existir quando a de cima
funciona. O acordo por loja aparecia na tela, o número saía certo, o histórico gravava — e
o preço de tabela, que é o que ele vence, não tinha onde ser digitado.

**O que mudou.** `app/products/new.tsx` ganhou o campo (gateado por `manage_company`, quem
DEFINE) e escreve por `saveSalePrice` para a história ser mantida por um lugar só;
`app/products/index.tsx` mostra o número (gateado por `view_sale_price`, quem VÊ);
`listProducts` passou a devolver as duas colunas por portões separados, e um teste cobra os
quatro casos — comprador vê os dois, vendedor só preço, operador nenhum,
`listProductsForLedger` sem portão. E o `e2e` ganhou o chamador de produção que fecha o P1
de verdade: cadastra um produto dizendo por quanto ele sai, e lê a lista.

**A lição é sobre onde eu aponto o P1.** Eu o uso como filtro para o que vou construir, e
ele é bom nisso. Aqui ele serviu para outra coisa: **auditar o que eu acabei de empurrar.**
Um commit meu passou pelo portão porque a peça de cima tinha tela — o portão pergunta "quem
chama?", e a resposta "a peça que depende dela" parece suficiente e não é. A pergunta certa
é quem chama **este caminho**, com **estes argumentos**: `placeId: null` e `placeId: 'x'`
são dois caminhos, e só um deles tinha tela.

**E a foto desmentiu o argumento que eu tinha escrito para justificar o lugar do
campo.** Pus o preço dentro do cartão "Palito, embalagem e rótulo" com um comentário
dizendo que preço ao lado de custo faz os dois decidirem (Lei 3) — e o comentário estava
certo sobre a lei e errado sobre o lugar: o número ao lado não é o custo por unidade, são
os cinco centavos da embalagem, e o título do cartão fala de palito. Nenhum teste podia
pegar isso, porque nada ali está errado *funcionalmente*: o campo aparece, grava e volta.
O que estava errado é o que a pessoa lê, e **a única coisa que lê é o olho**. O campo virou
cartão próprio logo depois de "Custo por unidade" — R$ 0,33 para fazer, R$ 2,50 para sair —
e ficou fora do `costing`, porque a revenda não tem custo calculado e é justamente ela que
mais tem preço.

Junto veio uma ferramenta: `--tocar` agora aceita `Rótulo=valor` e DIGITA. Metade do que a
foto não alcança não mora atrás de um toque, mora atrás de um número — e sem digitar, a
única foto possível deste campo era a do campo vazio, que é a foto do estado velho com o
nome do novo (`scripts/shot.mjs`).

**E uma coisa que a mesma rodada quase me fez consertar por engano.** Enquanto o `e2e` novo
falhava com o botão morto, eu li que a trava de classificação era só de tela — `grep` por
`unique.*flavor_id` não achou índice, e o docblock afirma que o banco recusa. Antes de
escrever "fundação que só vale no papel", rodei a contradição: o índice existe na `0018`,
com `nulls not distinct`, e `saveProduct` levanta `GridTakenError`. Meu `grep` procurou a
palavra na linha errada de uma declaração de várias linhas. O defeito era o `grep`, e a
regra da casa — *contradição achada é suspeita de leitura errada até virar prova* — pagou
sozinha uma segunda vez no mesmo dia.

---

## O empacotamento guloso não era melhor que alternar, e eu já tinha escrito que era

*6 de setembro.* O último resto do layout do tablet era o pé desigual das duas colunas —
estava no `docs/roadmap.md` como limitação conhecida: *"empacotar sem medir altura só é
justo por cima"*. Medir resolve, e a regra óbvia é gulosa: cada peça vai para a coluna mais
baixa no momento em que chega, na ordem da leitura.

Escrevi isso no docblock com a frase *"melhor que alternar em todo caso"* — e escrevi
**antes** de rodar. O teste sorteou cem listas de alturas e uma caiu: `290, 229, 119, 384,
236`. Guloso fecha com 90 de desnível; alternar, que não olha nada, fecha com 32. O motivo
é que guloso decide olhando só o presente — quando o 384 chega, a escolha que o acomodaria
já passou.

**O que mudou.** `distribuir` calcula as duas e fica com o pé menor (`src/components/
colunas.ts`), e um teste fixa esse caso pelo número para a próxima leitura não "simplificar"
de volta para a estratégia que perde nele. Na gaveta do "Mais" o desnível caiu de uns 800 dp
para uns 20; em "Relatórios" nada mudou, e a foto explica por quê — com três cartões,
`[0,1,0]` já é o melhor corte que duas colunas permitem.

**O que fica de método, e é o mesmo defeito de mais cedo hoje, noutra roupa.** De manhã eu
tinha escrito um comentário justificando o lugar de um campo com a Lei 3, e a foto mostrou
que o número vizinho não era o que eu dizia. Agora escrevi um docblock afirmando uma
propriedade da regra, e o sorteio mostrou que a propriedade é falsa. **Nos dois casos o
texto estava certo sobre o princípio e errado sobre o fato**, e nos dois o que corrigiu não
foi releitura: foi um instrumento que não lê — a foto e o sorteio.

Daí a regra prática: *frase que afirma uma propriedade do código ("sempre", "nunca", "em
todo caso") é uma asserção sem teste até alguém escrever o teste.* Ou se mede, ou se escreve
mais fraco.

**E um terceiro instrumento estava cego, o que explica por que só a foto pegava.** As 47
checagens do navegador rodam todas a **412 dp**, e `pares` só liga a partir de 840 — ou seja,
o caminho de duas colunas, que é metade do trabalho de layout desta semana, não tinha um
único exercício automático. Quem provava era a foto, e foto ninguém roda no CI. Entrou a
48ª, que abre `/more` a 900 dp e mede a coluna de cada grupo; com `alternando` no lugar de
`distribuir` ela falha dizendo o número — *"Ajustes x=16 contra 456 e 16"*, que é "Ajustes
está na coluna de Cadastros". **Suíte que roda numa largura só é cega para metade dos
defeitos de tela**, e isso já estava escrito no `shot.mjs` sobre a ferramenta de foto — a
suíte tinha o mesmo buraco e ninguém tinha olhado.

**E uma escolha que quase virou laço.** Medir para decidir onde a peça vai só é seguro
porque a largura de uma peça **não** muda com a coluna que a recebe — as duas são `flex: 1`
da mesma linha. Sem essa propriedade, trocar de coluna mudaria a altura, que mudaria a
distribuição, que mudaria a coluna. Está dito no `Grupo`, onde quem for mexer passa.

---

## A mesma raiz, segunda consequência: a aprovação de pedido é decoração no servidor

*6 de setembro, ao escolher o próximo item.* O `docs/roadmap.md` listava *"a aprovação de
pedido que nunca atravessa"* entre os médios que sobraram — do jeito que estava escrito,
lia-se como "falta escrever a tela". Fui medir antes de construir, e é o contrário: **a
aprovação existe inteira no aparelho.** `setOrdersNeedApproval` grava a bandeira, `saveOrder`
nasce `pending` por causa dela, `setOrderStatus` enfileira a decisão. Nada falta ali.

O que falta é a bandeira **atravessar**. Ela mora no `meta` do aparelho, `meta` não é tabela
de sincronia, e não existe entrada `companies` em `src/sync/serialize.ts`. Do outro lado, o
gatilho `order_starts_where_the_company_says` lê `companies.orders_need_approval` **no
servidor** — coluna que ninguém nunca escreveu, com `default false`. Então, no dia em que a
sincronia subir: a empresa liga a aprovação, o aparelho grava `pending`, e o servidor
reescreve para `open` na inserção. **A aprovação que a empresa ligou vira decoração**, e o
gatilho está certo — a regra não pode morar no aplicativo quando o pedido vem de fora.

É a mesma raiz do achado de mais cedo hoje, com outro sintoma: **configuração de empresa só
existe no aparelho.** Lá a consequência era o portão do dinheiro valer por aparelho; aqui é
uma regra de negócio inteira que o servidor desconhece. Duas consequências de uma raiz é o
sinal de que a raiz não é detalhe de implementação — é o item 2b (a camada da conta), e por
isso o médio foi reclassificado no roadmap em vez de virar trabalho agora. Construir a tela
antes da linha de `companies` é construir a metade que não fecha.

**E o método que achou isto foi o mais barato que existe:** abrir os arquivos que o item
pressupõe, antes de escrever a primeira linha. É o mesmo gesto de trinta segundos que já
tinha desmentido a dívida escrita errada, a fronteira caduca do assistente e o índice único
que eu ia chamar de ausente. Item de lista é hipótese até alguém conferir.

---

## O Espelho somava grama com unidade, e quem pegou foi a asserção que pedia a régua

*6 de setembro.* O Espelho da Loja responde *"quanto desta loja voltou do que chegou"*, e a
primeira versão respondia por LOJA: um `received` e um `returned` por lugar, com a fração
entre os dois. Testes verdes, três casos cobertos, incluindo o de duas lojas com o mesmo
total de volta e recebimentos diferentes — que é justamente o caso que a fração existe para
separar.

**Estava errado, e nenhum daqueles testes podia pegar.** O razão conta em unidade-base, e
unidade-base é **grama** para o açúcar e **unidade** para o picolé. Somar as duas dá um
"recebido" que não é de nada — e pior que o número sem sentido é o efeito: o item pesado
afoga o leve. Mil gramas de açúcar ao lado de dez picolés fazem *metade dos picolés de
volta* aparecer como **meio por cento** da loja. O item que interessa some dentro do item
que só está passando.

**Quem pegou foi o `e2e`, e por um caminho que não era o dele.** Escrevendo a asserção da
conta aberta — *"200 de 1.000 que chegaram"* — a linha pedia a unidade ao lado do número, e
eu fui procurar qual pôr. Não havia uma: havia duas. **Número sem unidade era o sintoma;
somar grandezas diferentes era a doença.** Meus testes de unidade usaram açúcar nos três
casos, então nunca houve duas réguas na mesma loja para a soma revelar o absurdo.

**O que mudou.** `storeMirror` devolve `items` por loja, cada um com a própria régua
(`baseUnit`), a própria fração e a própria janela anterior; a tela escreve a unidade ao lado
de cada número; e entrou o teste que faltava — uma loja que recebeu duas réguas, com a
asserção de que metade continua sendo metade e o açúcar não empresta peso a ela.

**E a foto pegou o segundo defeito, que nenhum teste veria.** Com a semeadura de três
meses, o Espelho saiu com **seis blocos idênticos de "Nada voltou"**, cada um com um selo
"antes eram 0,0%" — três produtos por loja, duas lojas, nenhuma devolução. Tudo verdadeiro,
tudo inútil: é o alerta inventado na forma calma, uma parede de nada que ensina a rolar sem
ler. Produto que não voltou não tem notícia, e notícia nenhuma cabe numa linha: agora a loja
mostra só o que voltou, e fecha com *"Nada voltou de 3 produtos."* — sem somar unidades, que
é o defeito de cima de volta pela porta dos fundos.

**E a semeadura tinha o mesmo buraco que os testes.** Com a devolução consertada, a foto
continuava dizendo *"Nada voltou de 3 produtos"* nas três lojas — porque a simulação de
noventa dias **despachava e nunca devolvia**. Uma tela recém-construída nascia sem nada a
dizer em toda instalação semeada, e não havia como olhar o estado que ela existe para
mostrar. Agora a simulação devolve, uma em cada seis viagens, com o motivo sorteado entre os
quatro — porque eles mandam fazer coisas diferentes, e semear um só ensinaria a tela a
mostrar sempre a mesma conclusão. O teste da semeadura cobra `returns >= 1`.
**Semeadura que não exercita uma tela responde "está tudo bem" sobre o que ela não simulou**
— é o mesmo defeito do conjunto homogêneo de exemplos, uma camada acima.

**E a primeira semeadura de devolução mentia de outro jeito.** Ela fatiava a
PRATELEIRA — e prateleira acumula. O Espelho saiu anunciando *"88,8% do que chegou
voltou"*, que nenhuma fábrica vive: o acumulado de um mês virava a devolução de um dia.
Devolução é parte do que **acabou de chegar**, então ela passou a ser um pedaço de uma carga
do dia. Número semeado implausível não é detalhe de simulação: é a tela ensinando quem olha
que ela exagera, e quem aprende isso para de acreditar no número quando ele for verdadeiro.

*(E eu li a foto errada antes de descobrir isso: duas execuções de foto se sobrepuseram, a
segunda morreu na porta, e eu li a saída da primeira como se fosse da segunda. O `CLAUDE.md`
já avisa exatamente isso, e eu repeti. O que impede é olhar se ainda há processo antes de
disparar o próximo — não a lembrança.)*

**A lição é sobre a forma do exemplo, não sobre atenção.** Os três testes que escrevi eram
bons e eram todos o mesmo caso: um item. Um conjunto de exemplos homogêneo prova o que é
verdade dentro da homogeneidade e cala sobre o resto — e cala com cara de cobertura, porque
o número de testes cresce. Onde uma função soma coisas, o exemplo que decide é sempre o que
mistura: **duas moedas, duas réguas, dois fusos, duas empresas.** Se todos os casos usam a
mesma, a suíte não está testando a soma.

---

## Uma varredura de P1 na camada de dados: 95 exportações, duas mortas — e uma delas tinha as palavras prontas em três idiomas

*6 de setembro.* Fechado o Espelho, fui procurar o próximo item e a lista escrita não
ajudava: o roadmap manda nos *"sete médios"* e só **um** deles está nomeado — os outros seis
nunca foram escritos em lugar nenhum que se possa abrir. Lista que aponta para itens sem
nome não é lista.

Então medi em vez de procurar prosa: um script que lê as exportações de
`src/data/repository.ts` e pergunta quem as chama fora de teste. **95 exportações, 5 sem
chamador de produção**, e três delas são helpers internos legítimos. Sobraram duas — e as
duas já estavam no `docs/DOSSIE.md`, na tabela 11.5, marcadas `X` e `Z` desde a auditoria.
**Os "médios" sem nome estão ali**, numa tabela de chamadores que ninguém tinha ligado ao
roadmap.

**`unchecked` é duplicata, e some.** Ela responde *"quais remessas ninguém conferiu"* — e
`shipmentsOn` já responde a mesma coisa, com o **mesmo** `NAO_ESTORNADO` e o mesmo `EXISTS
post = 'checked'`, e é essa que a aba de Transporte usa. Duas grafias de uma regra é como
duas verdades nascem; aqui a segunda nunca chegou a divergir porque nunca foi chamada.

**`lastCostMove` não era código morto: era uma TELA que faltava.** Ela responde *"quando um
insumo mudou de preço pela última vez"*, e o dicionário já tinha as palavras dela nos três
idiomas — `stableFor` (*"estável há {{days}}"*), `stableAlways`, `allSteady` (*"Tudo
estável"*) —, todas sem escritor. A capa mostrava o cartão de preço **só quando algo mexeu**:
a fábrica com o custo firme há dois meses via exatamente a mesma capa de quem instalou o
aplicativo ontem.

Isso contradiz duas coisas da casa ao mesmo tempo: *"'Está tudo bem' é estado válido e
bonito"*, e a primeira pergunta da Lei da Inteligência — **o que é normal ali**. Um custo
estável há 47 dias é a resposta dessa pergunta, e é ela que faz a próxima alta significar
alguma coisa. O cartão entrou nas duas peles, e a **duração** é o que o separa de um cartão
vazio: sem ela sobraria *"Nada mudou de preço"*, que é a terceira maneira de dizer o mesmo
silêncio — o defeito que a peça de produção ao vivo já pagou nesta mesma capa.

**E o teste dela quase virou um achado falso.** Escrevendo a cobertura de
`lastCostMove` passei `receivedAt` — campo que não existe em `recordPurchase`. O `tsx` do
`node --test` ignora propriedade desconhecida em silêncio, então a compra usou o relógio de
agora, a data voltou diferente da nota, **e eu escrevi um comentário inteiro explicando que
`observed_at` marca "quando se soube" e não a data da nota** — com a consequência de produto
tirada dali. Era consequência do meu erro de digitação. Quem desmentiu foi o `npm run
typecheck`, que o `node --test` não roda.

Duas coisas ficam. **A suíte de teste não é o compilador**, e um objeto literal a mais passa
por ela sem ruído — onde o teste monta entrada, tipo errado é silêncio, não vermelho. E a
regra da casa cobrou pela quarta vez hoje: *contradição achada é suspeita de leitura errada
até virar prova.* Nas quatro, o que a desfez foi rodar alguma coisa — a foto, o sorteio, o
`grep` refeito, o `typecheck`.

**O que fica de método.** Quando a lista escrita não nomeia o próximo item, a saída não é
escolher por gosto nem inventar: é **medir o repositório**. Trinta linhas de script
reproduziram o achado de uma auditoria inteira e ainda apontaram onde ele estava documentado.
E o resultado mudou de natureza no meio do caminho: comecei procurando o que apagar e
terminei achando uma tela que faltava — **função sem chamador é uma pergunta, não um
veredito**, e a resposta certa foi a mesma do `forgetSentBefore` de manhã: o conserto não era
apagar.

---

## A guarda do P1 só olhava uma pasta, e a doença não conhece pasta

*6 de setembro, depois da varredura.* Fechadas as duas órfãs da camada de dados, rodei o
mesmo script sobre **todo o `src/`** em vez de um arquivo. Sete exportações a mais sem
chamador nenhum, todas fora de `src/domain` — que é exatamente onde a guarda existente
olhava, e só ali.

O que apareceu, e o que cada uma era:

- **`registerSkills`** (assistente): um registro mutável com um escritor e nenhum
  extensor. O docblock dizia *"módulos registram o que sabem responder"*; nada nunca
  registrou, e a lista sempre foi `phase1Skills`. Ponto de extensão sem quem estenda é
  array pretendendo ser API. Saiu, e `knownSkills` passou a filtrar a lista direto.
- **`IconStock`, `IconCost`, `IconLoss`**: as linhas de relatório e a grade do "Mais"
  desenham com `Glyph.tsx` há tempo. Dois desenhos da mesma coisa é a doença das duas
  grafias em forma de traço — e **o docblock do arquivo afirmava que as telas usavam estes**,
  o que deixou de ser verdade sem ninguém notar.
- **`formatWeight`**: formatava gramas em "kg" com a unidade **escrita no código**, num
  aplicativo que agora tira a régua de `item.baseUnit` e vai para as duas lojas. Morta e
  errada.
- **`formatWeekdayInitial`**: a inicial do dia, ao lado de `formatWeekdayAbbrev`, que é a
  que se usa.

E três ficaram, com a razão escrita: `__setOpener` (gancho de teste, par de `__setDb`) e
`drain`/`serialize` — o motor de sincronia, que não tem chamador porque **o servidor não
subiu**, decisão do dono. Fronteira registrada não é código morto com desculpa; a diferença
é a razão poder ser conferida.

**O que fica, e é o ponto.** A guarda passou a ler o `src` inteiro, e a mensagem dela também
— *"estas funções exportadas nenhum código de produção chama"*. Provei que morde plantando
um `export function` inútil no `i18n` e desfazendo a plantação. Isso troca *"eu varri uma
vez"* por *"o repositório recusa a próxima"*, que é a diretriz da casa sobre guardas: conselho
eu esqueço na sessão seguinte, guarda roda sozinha.

**E a lição menor, que custou uma restauração.** Apaguei os três ícones com um laço que
cortava "do parágrafo anterior até a próxima função" — e ele comeu o `IconMore`, que estava
no meio. Edição mecânica por padrão textual não sabe onde uma função termina; o conserto foi
extrair o arquivo do commit para o rascunho e recortar por **intervalo de linhas conferido**.
O `git checkout` do arquivo, que seria o caminho curto, é justamente o que já apagou quinze
edições nesta branch — e o classificador de permissão o recusou, o que foi a segunda rede
funcionando.

---

## O prazo observado não espera meses de nota: espera alguém escrever a data do pedido

*6 de setembro, escolhendo o item seguinte.* O roadmap põe **compras inteligentes** como
"construir agora, calibrar depois", e a tabela da F4 — a que o dono mandou corrigir — diz o
motivo: *"o prazo observado a simulação gera"*. Fui conferir antes de construir, como a casa
manda, e a frase é **falsa**.

`observedLeadTimeDays` (`src/domain/cost.ts`) calcula a média entre `orderedAt` e
`receivedAt`. A coluna `purchases.ordered_at` existe desde a fundação, `recordPurchase`
aceita o campo e o grava, e a travessia até o servidor o leva (`src/sync/serialize.ts:352`).
**Ninguém escreve nele**: nem a tela de compra — `app/purchase.tsx` não tem campo de data
nenhum — nem a simulação, que chama `recordPurchase` duas vezes sem `orderedAt`. Então
`ordered_at` é sempre nulo, `observedLeadTimeDays` recebe uma lista vazia e devolve `null`,
e o ponto de recompra que depende dele é adivinhação com cara de matemática — que é
exatamente o que o registro da guarda diz, com o motivo errado.

**A diferença importa para o que fazer.** "Precisa de meses de nota" é um item que se espera;
"ninguém anota quando pediu" é um item que se **constrói**, e esperar não o resolve — sem o
escritor, os meses passam e a coluna continua vazia. É o mesmo formato do achado da aprovação
de pedido de hoje de manhã, com o sinal trocado: lá a peça estava pronta e faltava o caminho
para o servidor; aqui a peça está pronta e falta a **pergunta na tela**.

E a pergunta é legítima justamente porque o sistema **não** pode deduzi-la: a Lei 1 proíbe
pedir o que se pode calcular, e a data em que alguém ligou para o fornecedor não está em
lugar nenhum do razão. É o caso raro em que perguntar é o certo — e é uma pergunta só,
opcional, na tela que a pessoa já está preenchendo.

**O que muda por causa disto:** o roadmap deixa de dizer que a simulação gera o prazo, e o
item 6 passa a ter um primeiro passo nomeado — a data do pedido na nota — em vez de uma
espera que nunca terminaria sozinha.

---

## Duas linhas discordavam sobre a mesma data, e ninguém via porque ninguém lia

*6 de setembro.* Ao construir a pergunta *"quando você pediu"* — o escritor que faltava
para `ordered_at` — precisei do outro lado do par: `purchases.received_at`. E ele estava
errado de um jeito específico.

`recordPurchase` calcula duas datas: `at`, o instante da digitação, e `occurred`, a data
que a pessoa informou (*"a nota chega atrasada: o caminhão descarrega às sete e alguém
digita ao meio-dia"* — está no docblock, desde a V3). O **movimento** que a função cria usa
`occurred`, certinho. A **linha da compra** usava `at` nos dois campos. Então uma nota de
ontem lançada hoje dizia, na mesma transação: *o razão diz que chegou ontem, a compra diz
que chegou hoje.*

**Ficou invisível por três meses porque `received_at` não tinha um único leitor.** Coluna
sem leitor não é código morto — é uma afirmação que ninguém conferiu, e ela envelhece
errada em silêncio. No instante em que `deliveriesOf` passou a lê-la, o defeito virou
consequência: o prazo do fornecedor sairia inflado por todo atraso de digitação, ou seja, a
tela mediria **a fábrica** achando que mede o fornecedor.

**O que fica de método, e vale mais que o conserto.** O portão P1 pergunta *quem chama isto*
e a resposta "ninguém" é tratada como dívida de código. Este caso mostra a outra metade:
**escrever num campo que ninguém lê também é dívida**, e mais perigosa, porque o dado errado
se acumula. A guarda que ensinei hoje a olhar o `src` inteiro pega função sem chamador; ela
não pega coluna sem leitor. Fica anotado como a próxima guarda que este repositório pede —
comparar o que as migrações declaram com o que alguma consulta lê de volta.

E o achado só apareceu porque a peça nova precisou do campo. **Construir é a leitura mais
atenta que existe:** três auditorias passaram por `recordPurchase` sem ver, e um `SELECT`
novo viu na primeira tarde.

---

## A mutação tinha caducado, e a barra dizia verde há dias

*6 de setembro, com o repositório aberto por uma hora.* O dono abriu o repo para destravar
os minutos da CI, e a bateria pesada rodou pela primeira vez em dias. Quatro dos cinco jobs
verdes — inclusive o `db:verify` contra um Postgres de verdade e o portão. O quinto reprovou,
e o motivo é do tipo que **nenhuma barra local pegava**, porque local eu nunca rodava a
mutação inteira:

```
?  src/assistant/skills.ts: o trecho mudou — atualize esta mutação
   o assistente aponta a maior perda isolada como causa …
```

Não é mutação **sobrevivente**: é mutação **caduca**. A linha que ela quebrava era
`... + p.valueCents`; quando o portão do dinheiro entrou e `lossesOn` passou a devolver
`valueCents` nulo para quem não vê custo, a linha virou `... + (p.valueCents ?? 0)`. A
mutação deixou de casar, deixou de aplicar — e **a regra do assistente ficou sem rede desde
então, com a suíte verde por cima**.

**A camada nova do mesmo defeito de sempre.** O `mutate` existe porque suíte verde não quer
dizer regra protegida. Aqui foi um degrau acima: **a própria ferramenta que mede a proteção
tinha uma medida quebrada**, e como ela imprime `?` em vez de `ok`, o único jeito de ver era
ler a saída inteira — que é exatamente o que ninguém faz quando o comando leva seis minutos
e some no fim de uma barra longa.

O conserto foi de uma linha, e o que fica é maior: **toda mutação é acoplada a um texto exato
do código, então toda mudança de código pode caducar uma sem avisar.** A ferramenta já
distingue os três estados (`ok`, `?`, sobrevivente) e conta o `?` como defeito — isso estava
certo. O que faltava era a mutação rodar em algum lugar onde alguém lesse: ela roda só no
pesado, o pesado roda só em PR fora de rascunho, e o PR ficou meses em rascunho por decisão
de custo. **Três decisões razoáveis, cada uma barata sozinha, e juntas uma regra sem rede
por dias.**

E o achado veio de graça, de uma janela de uma hora que existia por outro motivo. Vale
lembrar disso na próxima vez que a conta apertar: o pesado não é luxo, é o único que
responde a pergunta que o rápido não faz.

---

## O servidor de verdade contou duas coisas que o Postgres descartável não tinha como contar

*6 de setembro.* O dono decidiu (a) — subir o servidor —, e as 31 migrações pendentes foram
para o projeto `norva`, que já existia desde 1 de setembro com só seis aplicadas. As 31
subiram sem uma falha. **E aí o linter da Supabase falou duas coisas que o `db:verify` não
sabe perguntar.**

**Uma função nova em `public` nasce aberta, e a revogação não se herda.** A `0005` revogou
`execute ... from public` nas duas funções daquele dia, e a `0006` mudou as duas para o
esquema `private`, fora do alcance do PostgREST. `apply_purchase_to_cost` seguiu protegida
porque a `0009` a reescreveu com `create or replace`, que **preserva** permissões.
`apply_production_to_cost` nasceu na `0025` com `create` — e chegou ao servidor publicada em
`/rest/v1/rpc/`, para `anon` e para `authenticated`.

Vale medir o risco sem inflar: é função de gatilho, e o Postgres recusa chamada direta
("trigger functions can only be called as triggers"). Ninguém entra por ali hoje. O que se
conserta é a **porta existir** — superfície publicada que ninguém pretendeu publicar, ao lado
de duas irmãs fechadas.

**E o conserto errou de papel na primeira tentativa.** Escrevi `revoke ... from public`,
copiando a `0005`. Rodou sem erro e o linter continuou acusando. A ACL, medida em vez de
suposta:

```
apply_production_to_cost  postgres=X  anon=X  authenticated=X  service_role=X
apply_purchase_to_cost    postgres=X                          service_role=X
```

`anon` e `authenticated` não estavam ali por herança de `PUBLIC`: são concessões
**nominais**, que a Supabase dá por privilégio padrão. Revogar de `PUBLIC` não remove uma
concessão nominal — são linhas diferentes da mesma ACL. E a `0005` tinha "funcionado" por
outro motivo que eu li como sucesso: quem protegeu aquelas duas foi a **mudança de casa** da
`0006`, não a revogação.

**As duas coisas que ficam de método.** A primeira é sobre o que cada instrumento pode
responder: o `db:verify` prova o **formato do esquema** contra um Postgres limpo, e isto é um
fato sobre a **API que o PostgREST publica em cima dele** — categoria que nenhum Postgres
descartável tem. *"O servidor sobe o mais tarde possível"* continua certo como economia, e o
preço dele acabou de aparecer: cada semana sem servidor é uma semana sem esta classe de
resposta.

A segunda é a armadilha que quase caiu junto: a migração do conserto, escrita para o
servidor, **quebraria o `db:verify`** — lá não existe `anon` nem `authenticated`, o papel
sem dono de tabela chama-se `app_user`. Verde onde ninguém olha e vermelho onde todo mundo
olha. A guarda `if exists (select 1 from pg_roles ...)` já existia na `0005` pelo mesmo
motivo, e eu não a copiei junto com a linha que copiei.

---

## Duas portas trancadas por dentro: o dono não podia criar a própria empresa

*6 de setembro, com o servidor no ar.* A decisão está escrita desde o começo — *"quem cria
a empresa é o dono, cadastrando-se sozinho"* — e o esquema **não permitia**:

- `companies` tem `companies_read` (select) e `companies_write` (update). **Não tem política
  de INSERT.** Com RLS ligada e sem política, insert é recusado para todo mundo, sempre.
- `memberships_manage` exige `has_capability(company_id, 'manage_company')`, que exige uma
  linha ativa em `memberships`. Para criar a primeira associação é preciso já tê-la.

Duas portas trancadas por dentro, com a chave de cada uma do outro lado. **Nenhuma tela
consertaria isso:** a recusa é do banco, e é ele que tem de saber abrir.

**Só apareceu ao ir usar, e é a segunda vez no mesmo dia.** O `db:verify` sobe as migrações
e prova dezessete garantias — nenhuma delas é *"uma conta nova consegue começar"*, porque a
verificação semeia empresa e associação direto na tabela, como superusuário faria. Ela prova
o esquema **depois** do primeiro dia, e o primeiro dia é o que ninguém tinha atravessado.

**O conserto é uma função e não uma política**, e a diferença é a transação. Uma política de
INSERT em `companies` abriria a criação para qualquer conta — o que está certo — mas deixaria
a associação do dono como um segundo passo, e entre os dois existe o instante em que a
empresa não tem dono. Uma conta que caísse ali criaria uma empresa **órfã**: invisível para
ela mesma, porque `companies_read` filtra por associação ativa, e impossível de apagar. A
função faz as duas numa transação — ou nasce empresa com dono, ou não nasce.

**E a lição da 0039 pegou de primeira.** Ao escrever as permissões da função nova, revoguei
de `public` **e** de `anon`, com a guarda `pg_roles`. Conferido na ACL: `postgres |
authenticated | service_role`. Meia hora antes, a mesma coisa me custou duas migrações.

**O aviso do linter fica, e a razão está no arquivo.** Ele acusa a função como executável por
`authenticated` — que é exatamente o que ela precisa ser: **ela É a porta, e porta que
ninguém abre não é porta.** Escrito na migração para a próxima leitura não "consertar" a
única coisa que faz o cadastro existir.

---

## Ausência só é dado se alguém consegue lê-la — 6 de setembro

O dono instalou o APK, comparou com o desenho que ele mesmo aprovou e disse: *"achei q
faltam cores em alguns elementos e principalmente animações… só o sol e o floco de neve
se mexem"*.

**Ele estava vendo o sistema funcionar exatamente como escrito.** A cena tem cinco
animações e três delas dependem de fato: a fumaça só sobe com tacho aberto
(`running`), o picolé só enche na proporção do dia (`dayShare`), e a caixa só entra se
saiu carga (`shipped`). Sem nada disso, sobram o sol e o floco — que são as duas únicas
que existem por ambiente. A fiação está certa e medida (`src/home/Mosaic.tsx`), e o
docblock da cena já dizia, com todas as letras, *"a ausência é dado"*.

**A prova de que a explicação não bastava são duas fotos idênticas.**
`.shots/capa-papel-claro-virgem.png` (empresa recém-instalada, zero movimento) e
`.shots/capa-papel-claro-com-dado.png` (três meses semeados, 511 unidades ontem) têm a
**mesma cena, pixel a pixel** — porque a foto com dado é de um domingo, e a fábrica
simulada não trabalha domingo. Empresa nova, domingo parado e terça de manhã antes do
primeiro tacho desenham a mesma coisa, e o desenho não diz qual das três é.

O que falhou não foi a decisão, foi a metade que faltava dela. **Dado que ninguém
consegue ler não é dado, é silêncio** — e a Lei da Inteligência já cobrava a diferença:
*toda conclusão abre a conta*. A cena concluía "não há tacho, não houve produção, não
saiu carga" e não abria conta nenhuma.

**O que mudou:** `cenaParada` (`src/components/cena.ts`) responde se as três peças do dia
estão fora, e a legenda debaixo do desenho passa a dizer *"Parada agora: sem tacho
aberto, nada feito e nada saiu hoje."* nos três idiomas. A regra mora em módulo puro por
dois motivos, e o segundo decidiu: `.tsx` arrasta o React Native e nenhum `node --test` a
carrega — mas, principalmente, **a legenda e o desenho saem do mesmo objeto**. Enquanto
eram contas separadas, nada impedia a frase de jurar que a fábrica está parada com a
chaminé fumegando ao lado.

**E a lição de método, que é maior que a tela.** Eu tinha o diagnóstico certo por leitura
de código antes de olhar qualquer imagem — e a leitura de código não teria achado isto,
porque o achado não é *"o código está errado"*, é *"o código está certo e ninguém
entende"*. Quem mostrou foi a comparação das duas fotos. Já está escrito na capa deste
projeto que verde não prova tela; falta a metade seguinte: **código certo não prova tela
lida.** O único instrumento que responde isso é alguém olhando — e desta vez o alguém foi
o dono, o que quer dizer que chegou tarde.

---

## O movimento existia em toda tela — calibrado para não ser visto — 6 de setembro

O dono cobrou animação pela enésima vez, segundo ele mesmo: *"perdi as contas de
quantas vezes eu te pedi… você já viu organismo vivo MORTO?"*. A primeira hipótese
óbvia estava errada, e medir levou dois minutos: **as 28 telas de `app/` já
importavam o vocabulário de movimento** (`Reveal`, `Vivo`, `Alive`, `Animated`).
Cobertura era 27 de 28 — a única fora delega para o `Mosaic`, que anima.

O defeito era amplitude, e ele estava escrito com todas as letras no
`src/theme/tokens.ts`: *"percebe-se se você olhar, não se percebe se você estiver
trabalhando"*, mais um teto de **dois elementos vivos por tela**. Os números que
essa doutrina produziu:

| | antes | depois |
|---|---|---|
| subida da entrada | 14 dp | 26 dp + escala 0,965 |
| cascata entre cartões | 40 ms | 70 ms |
| aperto do toque | 3% | 5% |
| ultrapassagem da mola | 2,5% (ζ 0,76) | 9% (ζ 0,61) |

Três efeitos ajustados para ficarem no limiar da percepção. Somados, produzem uma
tela que aparece pronta — que é exatamente a palavra que o dono usou.

**A cor tinha o mesmo formato de defeito e também era medível.** Os oito acentos
do Papel viviam entre 31% e 39% de luminosidade, e quatro eram quase cinza:
lilás com 18% de saturação, névoa com 12%. As réguas tinham contraste **1,39**
contra o papel. Uma família inteira de tons escuros do mesmo valor sobre creme —
sem registro claro, sem registro vivo, sem estrutura visível. Todos subiram de
saturação mantendo o matiz, com o contraste conferido por conta antes de escrever
(nenhum abaixo de 4,5).

**A lição de método é a mesma nos dois casos, e é a que vale guardar:** a queixa
do dono era qualitativa ("apagado", "morto") e a resposta foi um número em cada
caso. Nenhuma das duas exigia gosto — exigia medir o que estava lá. E as duas
foram consertadas em arquivo CENTRAL, não tela por tela: `Reveal` está em 27 das
28 telas, `CollapsingHeader` em 27, `Button` em 23, `ListRow` em 17, e os dois
últimos já liam o token do tema. **A alavanca de "todas as telas" eram quatro
arquivos.** Procurar essa alavanca antes de abrir a primeira tela é o que separou
uma rodada de vinte e oito.

---

## Sub-pixel não é sutileza, é ausência — 6 de setembro

Dezessete glifos deste aplicativo rodavam `withRepeat` perpetuamente para se
deslocar **menos de meio pixel**. A conta é direta e ninguém a tinha feito: um
ícone de aba desenha a 24 px numa prancheta de 24 unidades, então 1 unidade = 1 px
exato; ele oscilava 0,8° em torno de um centro a 20 unidades de distância, o que dá
um arco de 0,28 px — em quarenta segundos. Os glifos de 26 px numa prancheta de 32
ficavam entre 0,19 e 0,48 px.

**O laço roda, a bateria é gasta, e o olho não recebe nada.** E a assimetria que
torna isso um defeito e não um desperdício: `withRepeat` custa exatamente o mesmo
com 0,6° ou com 6°. A amplitude é de graça — só a decisão era cara.

**A causa tem endereço, e é uma frase copiada fora de contexto.** O `vida.ts` dizia
*"a regra da casa é ciclo de três a quarenta e oito segundos: percebe-se se você
olhar, não se percebe se você estiver trabalhando"*. Fui procurar de onde ela veio:
é cópia literal do comentário do **sol** no desenho aprovado
(`docs/design/aprovados/papel.html`), onde descreve uma **volta inteira de 360° em
trinta segundos**. Ela foi generalizada de um giro completo para uma oscilação de um
grau e meio — e nessa viagem virou o contrário do que dizia. No próprio arquivo
aprovado, tudo o que **não** é rotação roda entre 1,4 e 6 segundos: a fumaça em 6, o
picolé enchendo em 3,2, a caixa entrando em 1,4.

O que isso ensina, e vale além de animação: **uma regra citada de um lugar onde ela
era verdadeira pode ser falsa no lugar novo, e a citação carrega a autoridade sem
carregar a condição.** Enquanto a frase estivesse lá, a próxima sessão escreveria
mais um ciclo de trinta segundos — e estaria certa em citá-la. É a forma mais
educada de um erro se reproduzir.

**E é por isso que o dono "perdeu as contas de quantas vezes" pediu animação.** Ele
não estava pedindo de novo a mesma coisa: ele estava vendo, corretamente, que o que
tinha sido construído não aparecia. Três pedidos negados por uma frase.

---

## Uma coluna que ninguém escreve é pior que uma que não existe — 6 de setembro

Três achados do mesmo formato, no mesmo dia, e o terceiro é o que ensina.

**Primeiro:** a `0040`, que eu escrevi de manhã, criava a empresa sem gerar
`companies.join_code`. A coluna existe desde a `0011` com o propósito escrito ao
lado — é o código que o dono dita para alguém pedir associação —, e empresa
nascida naquele dia tinha a coluna nula. O caminho documentado não existia.

**Segundo:** o caminho de QUEM PEDE nunca foi construído. O estado `pending`
existia desde a `0011`, e não havia como chegar nele: quem ainda não é membro não
enxerga a empresa (a política filtra por associação ativa) e não pode escrever em
`memberships` (exige já ser membro ativo). Duas portas trancadas por dentro, e
desta vez do lado de fora.

**Terceiro, e é o pior:** `companies.orders_need_approval` é lida por um gatilho do
servidor que decide se um pedido nasce `pending` ou `open` — e ninguém nunca a
escreveu. A aprovação de pedido existe inteira no aparelho: a bandeira no `meta`,
`saveOrder` nascendo pendente por causa dela, a decisão indo para a fila. **No dia
em que a sincronia subisse, o servidor reescreveria para `open` na inserção** e a
aprovação viraria decoração — sem erro, sem log, sem teste vermelho. A empresa
teria ligado um interruptor que não liga nada.

**O padrão.** O portão P1 deste projeto persegue a função exportada sem chamador,
e a doença tem uma versão um nível abaixo que ninguém estava olhando: **a coluna
sem escritor**. Ela é pior por dois motivos. No código, o compilador acaba
reclamando de algo sem uso; num esquema, ninguém reclama nunca. E uma coluna com
`default` nasce com um valor plausível — `false`, `'personal'`, `null` — então o
sistema não parece quebrado: parece configurado.

**O que mudou por causa disso:** a `0041` e a `0042` fecharam as duas primeiras,
`src/data/configuracao.ts` fechou a terceira, e as garantias **18 e 19** do
`db:verify` passaram a cobrar as duas metades — que a empresa nasça com o código,
e que pedir para entrar não seja entrar. A 18 reprovou na primeira execução e o
conserto que ela forçou é a doutrina da casa: quem garante virou **gatilho**, não
função, porque função é um caminho e gatilho é a porta por onde todos passam.

**E a pergunta que fica como método**, para a varredura de amanhã: existe uma
guarda que liste toda coluna do servidor lida por política ou por gatilho e
confira que alguma escrita a alcança? Hoje não. As três acima foram achadas indo
construir em cima delas — que é o jeito caro.

---

## O mesmo estoque tem duas avaliações, e só uma pode assinar documento

**6 de setembro.** O dono perguntou o que eu acrescentaria e o que eu removeria. A
metade do "acrescentar" que eu tinha medido sozinho era pequena: o estorno existe,
é sólido, tem dez testes, e é alcançável de **duas** telas entre as nove que
escrevem no razão (`app/lots/[id].tsx:133` e `app/inputs/[id].tsx:505`). A carga
(`app/picking.tsx`) e a transferência (`app/transfer.tsx`) gravam sem botão de
volta — e operador que não consegue consertar aprende a não registrar, que é a
fundação perdendo pelo lado de fora.

A varredura adversarial achou três coisas maiores, e as três se confirmaram
contra o código.

**Primeiro, o que impede o extrato de ser prova.** `stockByPlace`
(`src/data/repository.ts:1073`) valoriza o saldo com o custo médio de **hoje** —
`item_costs.average_rate` é sobrescrito no lugar (`:502`, `ON CONFLICT DO UPDATE`)
e recomposto a cada estorno. `itemMovements` (`:1288`) devolve a taxa
**congelada por linha**, que é o que a `0008` criou de propósito ao largar
`unit_cost_cents`. São duas perguntas diferentes sob o mesmo rótulo: compre polpa
a 1,24 ¢/g em março e a 1,60 ¢/g em outubro, e o saldo de março re-lido hoje vale
1,60 enquanto a linha de março continua valendo 1,24. **Um extrato que soma as
linhas não fecha com a tela do lugar.** A régua, decidida aqui porque é correção e
não preferência: documento é o razão, e o razão é a taxa congelada — o valor do
saldo num extrato é a soma das linhas, nunca `saldo × média de hoje`. A média
continua servindo para precificar receita e decidir compra, e não pode assinar
nada, porque ela muda.

**E dois autores do mesmo arredondamento, cada um dizendo ser o único.**
`repository.ts` importa `amountOf` na primeira linha — *"the one place rounding
happens"* — e então chamava `cents(rate * qty)` em dois lugares (`:1119`, `:2875`),
cada um com o comentário *"arredondada aqui e só aqui"*. Dão o mesmo número hoje, e
é a igualdade que esconde o defeito: são dois lugares para consertar quando a regra
mudar. Neste repositório o `mutate` já trocou o `Math.round` do `amountOf` por
`Math.floor` e **noventa e dois testes seguiram verdes** — comentário que se
declara único não é o mesmo que ser. Os dois passaram a chamar `amountOf`.

**Segundo: o fechamento de período estava certo por acidente.** `reverseGroup`
faz `const occurred = input.occurredAt ?? at` e os dois chamadores de tela omitem
o parâmetro — então estornar hoje um erro de março escreve uma linha em outubro, e
o março que alguém já leu não se move. Isso é o fechamento de período estável de
graça, e **nada dizia que era de propósito**: nenhum comentário, nenhum teste, e
o parâmetro aberto para o próximo que achar "mais correto" datar o estorno no dia
do erro. No dia em que alguém fizer isso, todo mês fechado vira ficção retroativa,
sem erro, sem log e sem teste vermelho. Agora o docblock explica e o teste *a
reversal is dated today, so a closed month stays closed* prende as **duas** pontas
— o padrão cai em hoje, e a data explícita continua obedecida, que é como a
sincronia reproduz um estorno de outro aparelho.

**Terceiro, e é o que decide o adjetivo:** no aparelho o razão **não** é
append-only. Zero `TRIGGER` em `src/data/db.ts` contra três na `0001`; `erase.ts`
apaga `movements` em bloco com razão escrita e correta para o que ele faz;
`recorded_by` foi removida do aparelho na V5 (o serializador a preenche na
sincronia) e `device_id` nunca existiu. Somando: **um documento gerado no celular
não tem signatário.** Não trava nada hoje — trava só o nome: extrato do aparelho é
**conferência**, assinada por este aparelho, este operador, esta data. Documento
para terceiro é do servidor, onde `recorded_by` é imposto por política e o
`UPDATE` levanta exceção.

**O que mudou por causa disso:** os dois pontos de arredondamento viraram um,
o docblock do `reverseGroup` passou a dizer a regra da data, e o teste 420 a
prende. O extrato — que é a tela que torna o estorno alcançável das nove portas,
e é a mesma tela do extrato fiscal que o dono aprovou — soma taxa congelada, e
por isso não vai fechar com `stockByPlace`. Essa diferença é para aparecer na
tela, não para ser escondida com um arredondamento conveniente.

## E uma sobre a minha própria régua

Nesta mesma sessão eu reportei dois resultados de detector que eram artefato: os
"34 alvos de toque sem rótulo" (um `=>` terminando a expressão regular; a resposta
real era zero) e coordenadas de cena fora do chão (comandos SVG relativos lidos
como absolutos). Os dois custaram uma leitura do dono, e o segundo eu descartei
sem reportar só porque o primeiro tinha acabado de me queimar.

O projeto já exige de todo guard do repositório um teste positivo e um negativo. A
régua que eu escrevo para medir uma vez não passava por essa exigência — e é
justamente a que fala direto com o dono, sem CI no meio. **Detector novo não
reporta nada antes de passar num caso que eu sei verdadeiro e num que eu sei
falso.** Está no `CLAUDE.md` agora, porque conselho em conversa dura uma sessão.

---

## A cópia do aparelho, e o que ela ensinou sobre a minha própria régua

**6 de setembro, noite.** O dono levantou o Google Drive para backup, e a resposta
útil não foi sobre o Drive: **o risco fecha antes dele.** O banco do aparelho é um
arquivo (`src/data/db.ts:890`), e o SQLite tem `VACUUM INTO` — uma cópia consistente
num arquivo novo, sem parar o app e sem WAL pela metade. Com o arquivo de pé, uma
folha de partilha fecha o risco inteiro, sem conta, sem crédito e sem OAuth. O Drive
automático é conveniência em cima disso, e conveniência não é o que separa uma
fábrica com histórico de uma sem.

E `VACUUM INTO` preserva o `PRAGMA user_version`, que é o mesmo marcador que o
`migrate` usa — então **cópia antiga se restaura sozinha** pela escada que já existe
para um celular que ficou dois meses desligado. Isso não foi projetado: foi
descoberto medindo, e é o tipo de coisa que economiza um serializador inteiro.

**A escolha que interessa é `ATTACH` em vez de trocar o arquivo.** Trocar é mais
simples e tem uma janela em que não existe banco nenhum: falta de energia ali deixa a
fábrica sem os dados de antes E sem os da cópia. Para a peça cujo propósito é não
perder dado, atomicidade vale mais que simplicidade — e com `ATTACH` a volta é uma
transação só.

**A doença conhecida, um nível acima: a tabela sem restaurador.** A coluna sem
escritor apareceu três vezes este mês. Um serializador escrito à mão teria a mesma
forma e consequência pior — a fábrica voltaria *quase* inteira, o que **parece
certo**. Por isso a lista de tabelas é lida do `sqlite_master` em tempo de execução, e
o teste *no table is forgotten* cobra as duas metades: o que a cópia conhece volta, e
o que ela não conhece fica **vazio** em vez de intacto. Sobrar um pedaço do estado
antigo grudado na fábrica restaurada é o pior resultado possível dos três.

### E a régua que eu quebrei uma hora depois de escrevê-la

O teste da cópia antiga reprovou com `no such column: futura`, e a causa foi minha:
**`copia.pragma_table_info('items')` compila, roda, devolve nomes de coluna — e
devolve os de `main`.** O prefixo diz de onde vem a FUNÇÃO; o esquema da tabela é o
segundo argumento (`pragma_table_info(?, ?)`). Com a forma errada, comparar a cópia
com o aplicativo é comparar o aplicativo consigo mesmo, e o `INSERT` nomeia coluna que
a cópia não tem: **cópia antiga nunca restaura** — exatamente o caso para o qual cópia
existe.

O interessante não é o erro de SQL. É **por que eu escrevi a forma errada com uma
verificação na mão**: eu conferi `copia.pragma_table_info` contra uma tabela
**idêntica nos dois esquemas**. A régua devolveu `a,b` e eu li isso como prova, quando
ela não distinguia os dois casos que importavam. É a regra sobre detector novo que eu
tinha acabado de escrever no `CLAUDE.md` — quebrada dentro da mesma hora, o que diz
algo sobre o tipo de vigilância que uma regra escrita compra: nenhuma.

**O que mudou:** a regra continua no `CLAUDE.md`, e o que de fato pegou o defeito foi
outra coisa — **um teste cujo cenário era a cópia antiga**. Régua se verifica com dois
casos; o que garante é o teste que exercita o caso real. O primeiro é conselho, o
segundo roda sozinho.

## O `cmake` que falhava não era o `cmake`: era disco, e a causa era desperdício

**6 de setembro, noite.** Duas compilações do APK falharam seguidas com
`Process 'cmake' finished with non-zero exit value 1`. Eu quase fui atrás do
`cmake` — e a causa era outra, dois passos atrás.

`android/gradle.properties:31` pede as quatro arquiteturas
(`armeabi-v7a,arm64-v8a,x86,x86_64`), que é **o certo para o APK de entrega**. O
emulador desta máquina é x86_64, então três quartos do objeto nativo compilado ali
nunca seriam executados. A conta, medida: `.cxx` + `build` do reanimated (3,2 GB),
do expo-modules-core (3,3 GB) e do worklets (1,5 GB) — **8 GB**, quase todo de
arquitetura inútil para este laço. O disco chegou a 1,5 GB livres e o `cmake` caiu
por falta de espaço, reportando o próprio código de saída em vez da causa.

Três coisas que ficam disso, e a terceira é a que vale:

1. **Compilar aqui é uma arquitetura.** `-PreactNativeArchitectures=x86_64`. O
   `gradle.properties` já documentava a bandeira na linha 30 — ela estava escrita e
   ninguém a usava, que é a versão de biblioteca do "comando escrito é convite".
2. **O verbo virou parte do laço:** `node scripts/aparelho.mjs compilar`. Conselho
   em comentário eu esqueço na próxima sessão; verbo no script não se esquece,
   porque é o caminho mais curto.
3. **Mensagem de erro de ferramenta aponta para a ferramenta, e quase nunca para a
   causa.** O `cmake` disse "saí 1"; o `gradle` disse "o cmake saiu 1"; nenhum dos
   dois disse "sem espaço". A pergunta que resolveu não foi sobre o erro — foi
   `df -h`. Antes de investigar a ferramenta que reclamou, vale conferir o que ela
   precisava e não tinha: disco, memória, e processo velho comendo CPU (esse último
   já está registrado aqui, do `expo start` que ficou 6h38 no ar).

**E a terceira tentativa caiu por MEMÓRIA, com a causa sendo eu.** *"Gradle build
daemon disappeared unexpectedly"* — e ele desapareceu porque eu rodei `npm test` e
`npm run lint` **enquanto** o gradle compilava, numa máquina de 15 GB que já
hospedava um emulador de 3,6 GB e um daemon velho de 2,6. O gradle pedia 4 GB de
heap e não havia onde.

Isto é a cicatriz do `expo start` de 6h38 numa dimensão nova. A regra escrita aqui
fala de **processo esquecido** e de **CPU**; o que me pegou foi **processo meu, de
propósito, e memória**. A regra que fecha o buraco: *"esperar não é trabalho, e
trabalhar não é interromper"* já dizia para tocar o que não depende do que está
rodando — e eu li isso como "o que não depende **logicamente**". Depende também de
**máquina**. Enquanto o gradle compila, a suíte não roda: ela não conflita com o
código, conflita com a RAM.

Duas coisas práticas: `./gradlew --stop` é o jeito sancionado de matar daemon velho
(pelo dono do processo, não por padrão de linha de comando), e um build com o
emulador no ar cabe em `-Xmx2560m` — o nativo já está compilado, e o resto é Java.

---

## A asserção fraca: eu escrevi o teste que qualquer resposta satisfaz

**6 de setembro, noite.** Registrei uma produção pelo emulador — 506 picolés — e o
extrato mostrou o ato por **R$ 625,27**. Fiz a conta na mão: 506 unidades a R$ 0,64
são **R$ 323,84**. A diferença, R$ 301,43, era exatamente o consumo da receita.

O defeito é conceitual e não aritmético: **produção CONVERTE insumo em produto.** O
mesmo dinheiro aparece duas vezes no ato — uma saindo como polpa e açúcar, outra
entrando como picolé. Somar as pernas em módulo dobra; somar com sinal dá quase
zero (verdade contábil, mentira na tela). A régua honesta é **um lado**: o que
ENTRA, e quando nada entra — perda, consumo solto — o módulo do que sai. Assim uma
transferência vale a carga e não o dobro dela.

**Mas o achado não é esse.** É que eu tinha escrito o teste, ele estava verde, e a
asserção era:

```ts
assert.ok((ato.valueCents ?? 0) > 0, 'o dinheiro do ato é a soma em MÓDULO')
```

**Qualquer soma satisfaz "maior que zero".** A mensagem do assert descrevia uma
régua específica — *"a soma em módulo"* — e a condição não verificava régua nenhuma.
Escrevi a explicação certa ao lado de uma checagem que não a checa, e depois li o
verde como prova de que a régua estava certa.

Isso é a mesma família do `mutate` que trocou o `Math.round` do `amountOf` por
`Math.floor` e viu noventa e dois testes seguirem verdes: **a suíte não protegia a
regra, protegia a existência do número.** A diferença é que lá o culpado foi o
conjunto de exemplos escolhidos, e aqui foi a forma da asserção — mais fácil de
ver, e por isso mais vergonhoso.

**A regra que sai disto, e ela é curta:** asserção sobre um número calculado é
`assert.equal` contra o número **derivado de outra fonte**, nunca `assert.ok(x > 0)`.
Se a única coisa que se sabe dizer é "é positivo", o que está sendo testado é que a
função devolveu alguma coisa — e isso o typecheck já garante de graça. O teste agora
deriva R$ 323,84 do custo congelado da corrida e exige igualdade.

**E a régua que achou:** a foto. Nenhuma bateria olharia esse número, porque a
bateria concordava com ele. O que discordou foi a aritmética feita na mão em cima de
uma tela — que é a mesma coisa que o dono faria no primeiro dia de uso, e é por isso
que ele veria antes de mim se eu não tivesse olhado.

---

## Sete defeitos numa noite, e o que os achou não foi a suíte

**6 para 7 de setembro.** A barra estava verde o tempo inteiro — 435 testes, lint,
typecheck, CI. E sete defeitos reais apareceram, todos por **abrir o aplicativo**:

1. `application/vnd.sqlite3` faz o Android não oferecer **nenhum** app para receber
   a cópia. A chamada é idêntica, a promessa resolve igual; o que muda é a lista
   que o sistema monta do outro lado.
2. A estante da cena lia como janela vazia ocupando um terço da prancha.
3. Dois glifos diziam o assunto errado — um balde de estoque no cartão que avisa
   que a cópia leva **dinheiro** dentro. A guarda da assinatura passou nos dois.
4. A capa do primeiro dia deixava dois terços da tela em branco.
5. O extrato mostrou **R$ 625,27** numa corrida que fez R$ 323,84 — o mesmo
   dinheiro contado duas vezes, com o teste verde porque a asserção era `> 0`.
6. O estorno se anunciava como **"Correção de Correção"** — dado certo, leitura
   errada, e a asserção óbvia (`isReversal === true`) passava.
7. A separação mostrava o cabeçalho *"Para onde vai"* com **nada embaixo** e a
   frase *"essa loja não tem pedido"* numa fábrica sem loja nenhuma.

**Dois deles precisaram de mais que olhar.** O nº 5 saiu de eu **fazer a conta de
cabeça** em cima de um número na tela — 506 × R$ 0,64 — e ela não bateu. O nº 7 só
apareceu porque eu **segui a sequência**: produzir, e então separar. Abrir a tela de
separação isolada mostraria a mesma coisa e eu teria lido como estado vazio normal;
o que a torna defeito é chegar nela vindo de uma produção, com picolé no estoque e
nenhum lugar para mandá-lo.

**A regra que sai daqui, e ela é mais estreita que "olhe a tela":** exercitar o
aplicativo é seguir o CAMINHO de quem usa, não visitar telas. E onde houver número,
fazer a conta — a aritmética na mão é a única régua que não compartilha os erros do
código que produziu o número.

**E a guarda que eu não construí, medida antes de decidir.** A classe do nº 7 é
checkável — cartão com título cujo único conteúdo é um `map` sobre lista que pode
estar vazia. Varri: **quatro ocorrências, todas em `more.tsx`, todas listas
estáticas de portas que nunca esvaziam.** Uma guarda que nasce com zero achados e
quatro dispensas registradas é decoração, e decoração verde é pior que nada porque
ensina a confiar. Registrado o **não** com a medida ao lado, para o próximo que
tiver a mesma ideia não precisar remedir.

---

## `sale` não tem escritor, e isso decide o que o aplicativo consegue saber

**7 de setembro, achado construindo o *"produza até segunda"*.** O tipo de movimento
`sale` existe desde a fundação, e **nenhuma tela o escreve**. É a mesma família da
coluna sem escritor que apareceu três vezes ontem, um andar acima: uma **espécie de
fato** que o razão sabe representar e que nunca acontece.

A consequência não é cosmética. Hoje o aplicativo sabe **o que saiu da fábrica** e
não sabe **o que saiu para o consumidor** — a carga sai, chega na loja, e ali o
razão para. Três coisas dependem disso e nenhuma delas funciona sem:

- **O Espelho da Loja não tem como calibrar.** Ele compara o que chegou com o que
  voltou; sem venda, o que ficou na prateleira e o que vendeu são a mesma coisa
  para ele.
- **A cobertura da EMPRESA é infinita para produto.** Com a mudança de sala
  corretamente excluída da saída, o único jeito de um produto sair da empresa é
  perda. O *"produza até"* teve de perguntar da FÁBRICA por causa disso — o que é o
  modelo certo para produzir, e não substitui saber o que vendeu.
- **Margem não existe.** Custo congelado o razão tem; preço de venda combinado
  também. O que falta entre os dois é o fato de a venda ter acontecido.

**O que isto NÃO é: um defeito a consertar sozinho.** É tela nova, é decisão de
escopo, e existe uma pergunta de produto embaixo — quem registra a venda? A loja
própria, num aparelho da empresa, item a item? Ou a contagem periódica da prateleira,
que já existe e é cega, deduz a venda pela diferença? A segunda é muito mais barata
e cabe no que já foi construído; a primeira é um PDV, que é outro produto.

Fica escrito porque é a lacuna que mais decide o que o aplicativo consegue afirmar, e
porque descobri-la custou construir uma feature que perguntava a coisa errada.

---

## 7 de setembro — a capa foi consertada duas vezes e o resto ficou para trás, duas vezes

**O achado não é nenhum dos quatro defeitos abaixo. É o padrão que eles formam.**

O dono abriu o aplicativo e mandou duas correções em poucas horas. As duas são a
mesma frase com outro sujeito:

> *"o cabeçalho animado pegou as animações do tema do Papel. pelo visto vc esqueceu
> de fazer para o orgânico."*

> *"tem elemento aí do tema legado q está atrapalhando tudo"* — circulando a quina de
> um cartão dos Ajustes.

Nos dois casos a **capa** já tinha o vocabulário certo da pele e as **vinte outras
telas** ficaram com o antigo. E nos dois casos o conserto da capa está escrito no
repositório com o motivo certo — `src/home/capas/` existe exatamente porque *"o
Orgânico era o Papel com a cena trocada"* foi recusado uma vez. O que não aconteceu
foi a pergunta seguinte: **o que MAIS desenha isto?**

| o que a capa ganhou | o que ficou para trás | quanto tempo ficou |
|---|---|---|
| casco de página e de peça por pele (`Vestimenta`) | o `Card` de 35 telas desenhando a própria caixa | desde que `Tracos` nasceu |
| cena do herói por pele (`capas/organico.tsx`) | as 18 cenas de cabeçalho, uma geometria só | desde que o cabeçalho vivo nasceu |

A consequência escrita no `CLAUDE.md`: **conserto de pele não termina no arquivo que
o mostrou.** Quando uma peça passa a perguntar o traço, a rodada só fecha depois de
`grep` pelos outros que desenham a mesma coisa.

### Os quatro defeitos, e o que cada um ensina

**1. A cena do cabeçalho lia cor e espessura e desenhava uma geometria só.** O pior
não é o defeito: é que o docblock do arquivo dizia que ler a espessura da pele era
*justamente* o que evitava "o Orgânico é o Papel com outro desenho". Era o defeito,
com um parágrafo explicando por que não era. **Comentário que se declara imune é a
melhor pista de que ninguém conferiu.**

**2. A engrenagem sumia depois de começar a girar.** `transform` vindo de
`animatedProps` substitui o eixo declarado em `origin`, então a peça passa a girar em
torno do canto (0,0) e sai de vista em poucos graus. O eixo tem de entrar na própria
lista de transformações.

**3. O botão de um controle saía da prancheta pela esquerda.** `Cursor` recebia
CENTRO e CURSO, e a cena dos ajustes pedia centro 0,18 com curso 0,55 — meio curso é
0,275, então o botão ia a −0,095. **A assinatura deixava escrever um estado inválido**;
com começo e fim, qualquer par entre 0 e 1 fica no trilho. Não se conserta o número:
conserta-se a assinatura que permitia o número.

**4. A cunha na quina do cartão.** Borda esquerda grossa com canto arredondado: as
duas bordas têm de se encontrar ao longo de vinte e oito unidades de curva, e o que
sai é uma cunha que afina e desaparece. **O Papel nunca teve o defeito porque no
Papel a régua é em cima e a caixa não existe** — era defeito exclusivo da pele de
canto redondo, o que é outra forma de dizer que ninguém olhou a pele de canto redondo
fora da capa.

### E a régua que quase mentiu

O guarda escrito para o defeito 4 procurava os dois sinais no arquivo INTEIRO e
acusou o `Card` já consertado: o crachá redondo usa `radius.lg` num objeto e a régua
reta usa `borderLeftWidth` noutro, a oitenta linhas de distância. A segunda versão
ainda errava, porque corpo de função também é `{ … }`. **A régua só ficou de pé na
terceira**, e quem pegou as duas primeiras foi o teste do caso FALSO — o que a regra
da casa já exigia e que desta vez foi escrito antes de o número sair.

Prova final: rodada contra `git show HEAD:src/components/Card.tsx` — o arquivo real de
antes do conserto — ela acusa; contra o de depois, não.

### E um achado que só aparece quando se tenta mexer: o chão e os acentos são UM sistema

Para o cartão branco voltar a se ver, o chão do Orgânico precisava escurecer — ele
tinha três por cento de diferença para o cartão, o que numa tela de fábrica com o
brilho alto é diferença nenhuma. Ao escurecer, **onze acentos caíram abaixo de 4,5:1**
e a régua de legibilidade recusou.

O reflexo seria escolher no olho um verde "que dá para ler". Medindo, a resposta foi
outra e mais dura: **o chão de hoje já estava no limite** — `apricot` sobre `sunken`
dava exatamente 4,50:1, zero de folga. Ou seja, aquele chão não podia escurecer nem
um ponto sem os acentos escurecerem junto; a paleta estava presa, e ninguém sabia.

Então os dois desceram juntos: cinco a oito por cento de brilho a menos em cada
acento, **matiz e saturação intactas** — a mesma operação que os oito do Papel
sofreram no dia 6, pelo mesmo motivo. A régua ficou com folga em vez de encostada.

A lição de método: **quando um ajuste de cor quebra uma régua, a pergunta não é
quanto recuar — é se o valor de antes tinha folga.** Se não tinha, o que existia era
um limite escondido, e recuar é voltar a fingir que ele não está lá.

### O terceiro caso do mesmo padrão, e este ninguém tinha visto: a folha de confirmação

Procurando o que MAIS estava só num lugar, apareceram dois de uma vez.

**O `CountUp` existia só em `src/home/`** — o número que anda até o valor, pedido pelo
dono para *"todas as telas"*, morava na capa e em lugar nenhum das outras vinte.

E **toda confirmação do aplicativo saía azul.** `ConfirmProvider` mora na raiz, acima
de todo `AreaProvider`, então lia a área padrão — que é a da capa. Apagar uma receita
nos Ajustes, despachar carga no Transporte, tudo com o tom da home. No Papel isso
nem se notava, porque lá o botão cheio é da marca e é igual em toda tela; **no
Orgânico, onde a cor É o assunto, a folha respondia o assunto errado** — e é a única
pele em que dá para ver.

O conserto não é passar a cor: é a folha aprender o NOME da área e abrir um
`AreaProvider`, porque a regra do tema é *"No screen ever passes a color down by
hand"*. Com o nome, o botão, a régua e o crachá acertam sozinhos.

**E embaixo disso havia uma cópia.** A folha desenhava o próprio botão em vez de usar
o `Button`, e a cópia já tinha divergido três vezes: a forma do canto (consertada uma
vez, copiando a regra em vez de usar a peça — o comentário dessa correção ainda está
lá, dizendo que o `Button` respeitava e a folha não), a tinta do preenchimento (que
ignorava `tintaCheia`) e a tinta do rótulo (declarada em vez de medida contra o
fundo, que é um defeito que a foto do Papel escuro já mostrou uma vez).

A lição, e ela é a de sempre neste arquivo virada de outro lado: **quando se corrige
uma divergência copiando a regra, a próxima divergência já está paga.** O conserto
certo era usar a peça.

### E o achado mais duro do dia veio numa pergunta de três palavras: "o q são essas árvores?"

O dono olhou a faixa e perguntou o que árvore (ou fungo) tem a ver com Ajustes —
*"o app nao é aplicativo de biologia. é produção, controle, transporte,
financeiro..."*.

**O defeito não é o desenho ser feio. É ser decoração.** Eu tinha medido um vão de
trinta por cento de céu vazio, concluí certo que vazio numa faixa baixa lê como
desligado, e enchi com a primeira coisa que cabe num horizonte — em vez de com a
coisa que pertence a ESTE horizonte. Escrevi no próprio arquivo que os pássaros eram
*"ambiente, não afirmação"*, como se isso fosse permissão. Não é: é o alerta
inventado virado para o desenho, e ensina exatamente a mesma coisa — a não olhar.

A regra que sai daqui e que o `CLAUDE.md` não tinha: **"vida é ambiente" não
autoriza vocabulário de outro mundo.** Um horizonte de fábrica se enche com silo,
galpão e poste; se a única coisa que ocorre para encher é natureza, o problema não é
o vão — é que não se perguntou de que mundo a tela é.

E uma coincidência que não é coincidência: no mesmo arquivo, três horas depois de eu
escrever o parágrafo explicando que **`animatedProps` substitui o `transform`
declarado**, escrevi um `transform` estático ao lado de um `animatedProps`. O
comentário estava a quarenta linhas de distância. Regra escrita no arquivo não
impede o autor do arquivo.

---

## 7 de setembro, madrugada — a lista mentia quatro vezes, e o achado é a lista

Fui pegar a próxima coisa da fila quatro vezes nesta sessão. **Quatro vezes o código já
tinha a coisa pronta** e o `docs/roadmap.md` a descrevia como aberta:

| o que a lista dizia | o que o código já tinha |
|---|---|
| "o caminho de volta é alcançável de duas telas" | `app/extrato.tsx` lista qualquer ato e estorna qualquer um |
| "três configurações de empresa sem leitor" | `configuracao.ts:122` lê as quatro; `floorSignIn()` decide a entrada |
| "o `[por quê?]` falta em quase toda tela" | falta, mas a peça existe e serve uma tela — o trabalho é outro |
| "as perdas não abrem a conta" | abrem: o segundo cartão da tela lista cada motivo, e o comentário cita a Lei 6 |

**Por que isso importa mais que quatro linhas erradas.** A regra "nunca ocioso" manda
pegar a próxima da lista escrita em vez de inventar tarefa — e uma lista velha
transforma essa regra numa máquina de reconstruir o que existe. O defeito não é a
documentação estar desatualizada; é a lista ser **a entrada de um laço automático** e
ninguém medir o que ela afirma.

A regra que sai daqui e vale para toda sessão: **antes de construir o próximo item,
medir a afirmação dele contra o código.** Um `grep` pelo chamador custa dez segundos e
já evitou quatro reconstruções.

E o inverso também apareceu, no mesmo dia e mais caro: o item que a lista dava como
**feito** — o cabeçalho vivo do Orgânico — era o que o dono achou quebrado na foto. A
lista erra nas duas direções, e nas duas o conserto é o mesmo: medir.

## E a régua que veio de NÃO construir: a conta que cabe na página fica na página

O `WhySheet` foi generalizado — deixou de conhecer `RecipeCost` e passou a receber uma
`Conta` de parcelas e fechos, com a aritmética em `src/domain/conta.ts` provada por
igualdade (as fatias somam um, as partes somam o total). Dois chamadores: o custo de
uma receita e o dinheiro parado.

Ao ir ligar o terceiro — as perdas — a conta **já estava aberta na página**. E ali a
folha seria pior: um gesto escondido substituindo uma lista visível.

Então a Lei 6 não pede uma folha; ela pede que a conta seja alcançável. **A folha é o
mecanismo para quando a conta não cabe na página**, e onde cabe ela fica à vista — sem
depender de alguém descobrir que existe um toque longo. Escrever isso mudou o que
sobra do item: ligar os números cuja conta é longa ou mora noutra tela, e não os que já
mostram as parcelas embaixo de si.

**O que a foto pegou e nenhum teste pegaria:** a maior parcela da conta do estoque
saiu como `R$ 11.616,44` **sem rótulo** — o lugar padrão nasce sem nome, e
`app/places.tsx` já tinha a palavra de reserva certa desde sempre. Seria a terceira
divergência da noite se eu a copiasse; virou `nomeDoLugar`, uma peça que as duas telas
chamam.

**E uma ferramenta que faltava para a Lei 6 poder ser verificada de todo:** o
`shot.mjs` não sabia segurar o dedo. `--tocar` num cartão que também navega leva
embora — a foto sairia da tela seguinte com o nome da conta, que é a pior forma de
errar. `--segurar` existe agora, e sem ele nenhum `[por quê?]` deste roadmap poderia
ser olhado daqui.

## E o ângulo que sobrou quando a fila acabou: o que um teste afirma × o que ele exercita

Com a lista sem item desbloqueado, a diretriz manda **procurar** o achado. O ângulo
que eu ainda não tinha olhado nesta sessão é o que o `CLAUDE.md` nomeia como o defeito
mais caro que já apareceu aqui: *asserção sobre número calculado é igualdade contra
outra fonte, nunca `> 0`*.

Varri as 53 ocorrências de `assert.ok(... > 0)` da suíte. A maioria é pré-condição
legítima — *"havia movimento para copiar"* prepara o cenário e não afirma nada sobre o
resultado. **Duas eram a afirmação central do teste**, e as duas passariam verdes com
o número errado:

| o teste | o que ele afirmava | o que provava |
|---|---|---|
| *"a sub-receita levou o custo para cima"* | que o custo da sub-receita entra no lote | só que o total é positivo — e o total tem a sub-receita como ÚNICA linha, então qualquer fração dela passa |
| *"a cópia levou os movimentos"* | que o backup carrega tudo | só que carregou pelo menos um. Uma cópia com 1 de 1.240 movimentos passava |

O segundo é o pior possível: **prejuízo de backup incompleto não tem estorno**, e só
aparece no dia em que alguém precisa dele.

Os dois viraram igualdade contra outra fonte — o custo do Sabor contra metade do lote
da Base (ele usa 10.000 dos 20.000 ml que ela rende), e a contagem da cópia contra
`countMovements()` do aparelho. E **as duas foram provadas quebrando o código de
propósito**: com a sub-receita pela metade o teste falha em `354 !== 708`; com um
movimento a menos na cópia, `6 !== 7`. Restaurado o código, verdes.

A igualdade do custo ainda prova uma segunda coisa de graça, que a antiga não tocava:
a perda de 5% do Sabor **não** reduz o custo do lote. Quem perde perde o que sobra — o
lote é pago inteiro —, e um motor que descontasse a perda ali daria 672 em vez de 708.

**A lição de método:** a busca por "teste que passa pelo motivo errado" é barata e
dirigível — um `grep` por `assert.ok` com comparação frouxa, e depois julgamento sobre
quais são pré-condição e quais são a tese. O que ela custa é a parte que não dá para
automatizar: ler a frase ao lado da asserção e perguntar se a checagem prova aquilo.

## O achado que só a máquina acha: uma asserção circular com cara de igualdade

Depois da varredura manual por `assert.ok(... > 0)`, rodei o `mutate` — a versão
exaustiva da mesma pergunta. Ele plantou 110 defeitos e **um atravessou a suíte
inteira**: apagar `+ product.unitPackagingRate` do custo congelado de uma corrida.

O estrago desse: o palito e o saquinho somem do custo, toda margem futura sai inflada
exatamente pela embalagem, e **congelado é congelado** — o número errado fica no razão
para sempre, sem estorno possível porque não é um erro de lançamento, é a definição do
custo daquela corrida.

E o teste que afirmava justamente isso **existia**, com a frase certa ao lado:

```js
const semEmbalagem = run.unitCostRate - 0.4;
assert.ok(Math.abs(run.unitCostRate - (semEmbalagem + 0.4)) < 1e-9,
          'a taxa congelada carrega os quatro décimos');
```

`semEmbalagem` é DEFINIDO como a taxa menos 0,4. Logo `semEmbalagem + 0,4` é a própria
taxa, e a comparação é verdadeira para qualquer número — inclusive para nenhum.

**O que isto ensina sobre a busca manual que eu tinha acabado de fazer:** ela achou
duas asserções fracas e passou por esta sem ver, porque a linha tem `Math.abs`, tem
tolerância e tem duas variáveis — ela *parece* uma igualdade contra outra fonte. A
fraqueza não está na forma da linha, está na PROCEDÊNCIA do valor comparado: um lado
foi derivado do outro. Isso um `grep` não enxerga e um olho distraído também não.

Daí a regra que fecha o assunto: **a segunda fonte tem de ser independente da
primeira.** Aqui ela passou a ser a mesma corrida com a embalagem zerada — duas
corridas idênticas congelam o mesmo consumo, porque a média só se move em COMPRA e não
há compra entre elas; logo a diferença entre as duas é a embalagem e nada mais.
Reproduzindo a mutação, o teste agora falha em `0 !== 0.4`.

E uma medida junto, com uma inversão no fim. O `docs/roadmap.md` afirmava *"108 pegos e
2 equivalentes"* e a execução real deu **107 pegos, 1 sobrevivente e 2 equivalentes**.

Só que o número da barra não estava errado: **o código é que tinha escorregado até
ele.** Depois do conserto, a segunda execução deu exatamente 108 pegos, zero
sobreviventes e as 2 equivalentes de sempre. A linha do plano estava certa e a suíte
havia deixado de cumpri-la sem ninguém notar — que é o contrário do padrão desta noite,
em que a lista descrevia como aberto o que já estava pronto. **A lista erra nas duas
direções, e as duas se descobrem do mesmo jeito: medindo.**

As duas equivalentes continuam sendo as mesmas de sempre, e a ferramenta explica por
quê: o estorno tem duas checagens em camadas, e tirar uma deixa a outra pegando com o
mesmo erro. Nenhum teste de uma linha de execução só as distingue — só concorrência
real, e a suíte não tem duas conexões. Elas ficam na lista porque apagá-las esconderia
a redundância que as torna assim.

## O custo medido da divisão rápido/pesado: cinco checagens vermelhas por semanas

A barra inteira rodou nesta madrugada pela primeira vez em muito tempo, e o navegador
deu **44 de 49**. As cinco falhas não eram defeito do aplicativo: eram checagens que
envelheceram quando a capa emagreceu de quinze peças para sete — decisão do dono,
registrada. Cada uma media, sem querer, *"esta peça vem ligada de fábrica"* em vez do
que o nome dela promete.

**O que interessa não é o conserto, é o tempo.** Elas estavam vermelhas desde aquela
mudança e ninguém viu, porque:

- a CI rápida (tipos, lint, teste, pacote) roda em todo push e **não abre navegador**;
- a CI pesada (`mutate`, `e2e`, `db:verify`, `proofgate`) só roda indo para `main` ou
  pelo botão — e não foi para `main` desde então;
- e a regra da casa que manda rodar a barra inteira ao "fechar uma etapa" depende de
  alguém lembrar.

Essa divisão foi uma decisão certa e medida: a barra inteira levava perto de meia hora
por commit, e servir a barra estava roubando rodadas de servir o app. **O custo dela é
este, e agora tem número:** cinco checagens do navegador ficaram vermelhas por semanas
sem ninguém saber, e o mesmo passe achou uma mutação sobrevivente no custo congelado —
o número de onde sai toda margem.

A consequência que dá para escrever hoje: **quando uma decisão muda o que a capa mostra
por PADRÃO, o `e2e` é parte da mudança e não do fechamento.** Não é a barra inteira que
falta — é reconhecer que mexer no padrão de uma tela é mexer no que as checagens
assumem, e isso se descobre em quatro minutos de navegador ou em semanas de silêncio.

---

## 2026-09-07 — a guarda que FABRICA o número que o documento repete

**O que se viu.** A tabela do `docs/roadmap.md` que se chama *"onde o produto está hoje
— medido, não afirmado"* dizia **18 capacidades**. A guarda que a defende, `src/bar.test.ts`,
derivava esse número assim:

```ts
new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)]).size
```

— sobre o **arquivo inteiro** de `src/domain/access.ts`. E o arquivo tem duas listas: as
doze capacidades e os sete papéis. Seis dos sete papéis são minúsculos (`'owner'`,
`'operator'`, `'driver'`, `'buyer'`, `'customer'`, `'salesperson'`) e entravam na conta;
`'storeManager'` escapava **só por ter maiúscula**. Doze mais seis dá dezoito.

**Por que é pior que um número errado.** O documento não foi escrito antes e conferido
depois: ele foi escrito **a partir da guarda**. Então os dois concordavam, o teste ficava
verde, e a única fonte independente — o enum `capability` do Postgres, que tem doze
valores — nunca era consultada. A linha de cima da mesma tabela já dizia `papéis | 7`,
ou seja, os papéis eram contados duas vezes, uma delas com o nome errado.

Este projeto já tinha escrito a regra certa noutra forma: *"uma guarda que compara duas
coisas escritas pela mesma mão não guarda nada, e a pergunta certa é de onde vem o outro
lado da comparação"*. Faltava a versão de dentro: **uma guarda que deriva do escopo
errado não é uma guarda folgada — é uma fábrica de número, e o documento vira o eco
dela.** O recorte agora é o corpo da lista, como o `papeis()` ao lado sempre fez.

## Fronteira dita em voz alta continua sendo fronteira

O docblock do `TABELA` admitia, com estas palavras: *"acrescentar uma linha à tabela sem
acrescentar uma entrada aqui não quebra nada — e essa é a fronteira honesta desta
guarda"*. Quatro linhas abaixo do próprio título, o roadmap prometia o contrário:
*"`src/bar.test.ts` **roda essa coluna**: cada linha é derivada do sistema"*.

Medido: **dez das treze linhas**. Fora ficavam a versão do aparelho (`V22`), a contagem
de linhas de código (`~45.000`) e as guardas da proofgate (`24`) — e o regex da guarda
**nem casaria** com `**V22**` nem com `**~45.000**`, então não encontrar não era erro,
era silêncio. Duas das três estavam erradas: a proofgate tem 25 guardas, e o repositório
tem **71.828** linhas, 59% acima do escrito.

A honestidade do docblock não conserta nada — ela só documenta o buraco para quem lê o
teste, e quem lê o plano lê a promessa. Agora uma segunda checagem recusa linha de tabela
sem derivação atrás, e as três entraram (a de linhas de código com folga declarada de
10%, porque ela é escala e não fato).

## O plano errou nas duas direções, e uma auditoria adversarial contou: 38 vezes

Seis auditores mediram `docs/roadmap.md` contra o código, e um refutador independente por
fatia tentou derrubar cada achado. **38 contradições de pé, 16 derrubadas.** A maior parte
é *aberto-mas-pronto* — o defeito que já tinha custado seis re-derivações numa noite —, e
três formas novas apareceram:

- **Linha que chegou falsa ao disco.** *"`ordered_at` … ninguém escreve nele"* foi escrita
  no MESMO commit que acrescentou a pergunta à tela de compra. Não envelheceu: nasceu
  velha.
- **Item corrigido num lugar e não no outro.** *"O extrato do cliente continua de pé"* foi
  escrita às 00:40 e o extrato entrou às 00:46 — seis minutos —, e a linha ficou.
- **Âncora `arquivo:linha` que aponta para outra coisa.** Três âncoras da aprovação de
  pedido caíram em código diferente. Em arquivo de seis mil linhas, o número da linha
  envelhece a cada commit; o nome da função não.

**A consequência é mecânica, não conselho.** Cada item da fila e cada linha da tabela *A
ORDEM* passou a carregar uma **medida** em comentário de HTML — `<!-- medida: ausente
<alvo> :: <agulha> -->` para item aberto, `presente` para item fechado, `espera` para o
que nenhum comando responde (com o que se espera escrito). `src/plano.test.ts` roda todas
e recusa item sem medida. No dia em que alguém construir o que a fila dá como aberto, a
suíte fica vermelha e o plano é atualizado no mesmo commit — que é a regra 1 dele
deixando de depender de memória.

## Promessa em docblock não envelhece sozinha; guarda envelhece a cada commit

`src/config/brand.ts` abre dizendo *"nothing else in the codebase hardcodes the name.
Changing brands is an edit to this file plus `app.json`"*. Era verdade em 4 de setembro e
apodreceu em 6, quando entraram a folha de partilha do backup (`dialogTitle: 'NORVA'`) e a
recusa de cópia nos três idiomas. **Quatro lugares, os quatro chegando à tela**, num
produto cujo nome ainda não passou pelo INPI e que vai para duas lojas.

O conserto foi o de sempre e o guarda é novo: o nome sai de `brand.name`, o texto traduzido
recebe `{{app}}`, e `src/marca.test.ts` recusa o quinto. Provado nos dois sentidos contra
os arquivos de antes — pega os quatro, e deixa em paz o comentário que fala do produto pelo
nome, porque a prosa deste repositório fala dele assim.

## O vizinho da propriedade, terceira aparição: o coletor que descarta teste

`src/layers.test.ts` promete que só a camada de dados lê dinheiro sem portão, e o roadmap
promete mais: *"recusa qualquer arquivo fora de `src/data/` e `scripts/`"*. O coletor
descarta `*.test.ts` — o que está certo para quase toda regra de camada, porque teste que
FALA de SQL não é tela que FAZ SQL, e está errado para esta, que é sobre quem **chama**.

Havia um chamador de verdade lá dentro: `src/notify/facts.test.ts`, em quatro linhas. O
guarda agora varre os testes também, e esse fica dispensado com a razão escrita ao lado.
Provado desligando a dispensa: quatro linhas acusadas, e religando, zero.

## Nada achado: a animação de entrada

Fui medir a cobertura de *"quero animação em todas as telas"* com um `grep` por
`FadeIn|entering=` e ele devolveu **uma** tela de 22 — número que, dito ao dono, teria sido
uma acusação falsa. A entrada mora no `Reveal`, e são **30 de 31 telas**; a que falta é a
capa, cujas peças o usam por dentro. A régua estava errada, não o app.

Fica registrado porque a lição não é sobre animação: **antes de dizer um número, rode a
régua contra um caso que você sabe que ela deve pegar.** Aqui o caso verdadeiro era
`app/settings.tsx`, e a régua o deu como vazio.

## Dois arquivos com o mesmo nome, e eu construí de novo o que já existia

**O achado é o meu erro, e ele quase virou código no repositório.**

Procurando o irmão do achado das capacidades — *"e quem confere que a lista do aparelho
é a mesma do servidor?"* —, o próprio `src/domain/access.ts` respondia, com nome e tudo:
*"matching the server's `capability` enum value for value — `agreement.test.ts` fails if
the two ever drift"*. Grepei `agreement.test.ts` por `capability` e a resposta foi
**zero**. Isso lê exatamente como a família que eu já tinha achado três vezes na mesma
rodada: docblock que promete uma rede que não está lá.

Escrevi a rede. Escrevi o achado. Escrevi o commit. E aí, procurando OUTROS docblocks
que nomeiam guarda, descobri que existem **dois** arquivos chamados `agreement.test.ts`
— um em `src/domain/`, outro em `src/sync/` — e que o segundo tem, desde sempre, o teste
*'the capability vocabulary is the same word list on both sides'*, lendo o enum das
migrações e comparando nos dois sentidos. Eu tinha duplicado uma rede existente, e
desfiz o commit antes de ele sair daqui.

**Por que a regra da casa não me salvou.** O `CLAUDE.md` diz *"contradição achada é
suspeita de leitura errada, até virar prova"*, e ela não pegou porque eu **tinha** uma
prova: um `grep` que devolveu zero. O que faltava não era ceticismo, era saber que o
alvo do `grep` era ambíguo. Um `grep -c` num arquivo é régua perfeita para *"este arquivo
menciona isto?"* e régua quebrada para *"o repositório tem esta rede?"* — e as duas
perguntas se parecem demais quando se está com pressa.

**O conserto não é lembrar melhor.** `src/layers.test.ts` passou a recusar docblock de
código que aponte para um guarda por um nome de arquivo que existe em mais de um lugar;
os apontadores soltos (`access.ts`, `db.ts`, `purchase.tsx`) ganharam o caminho inteiro.
Provado nos dois sentidos: `agreement.test.ts` é hoje o único nome repetido do
repositório, e um nome único não entra na lista.

*O motivo de a rede importar continua de pé, e vale escrever: `memberships.capabilities`
e `people.capabilities` são `capability[]` no Postgres, então uma capacidade que só
existe no aparelho é um valor que o enum recusa — o insert falha e a fila trava para
sempre, que é o defeito crítico já consertado três vezes nesta branch por três caminhos
diferentes. Só que a rede contra ele estava lá.*

## A confirmação dizia "isso apaga 1 produto" e levava o livro-razão junto

**O que se viu.** `eraseArea('products')` apaga `items` de tipo produto, e
`movements.item_id` referencia `items` com `ON DELETE CASCADE`. Então apagar produtos
leva **produção, despacho, perda e contagem daquele produto** — e `tallyFor('products')`
devolvia `movements: 0`, então o diálogo dizia só *"isso apaga 1 produto"*.

Medido contra o banco, com o exemplo semeado mais uma corrida de tacho: os movimentos
caem exatamente pelo número dos que apontam para produto, e o número anunciado era zero.

**Por que escapou, e é a parte que interessa.** A cicatriz irmã já existia e já tinha
sido paga: quando *"apagar compras"* levava o razão inteiro, o conserto foi acrescentar
`EraseCounts.movements` e dizer o número na tela, com o raciocínio escrito no docblock.
Aqui o mesmo dano acontece por outro caminho — **ninguém escreve a palavra `movements`
em `tablesFor('products')`**, ele sai por CASCADE — e o docblock da cicatriz não alcança
o que não é `DELETE` explícito.

**E o que segurava a crença errada era um TESTE.** A fixação do `tallyFor` afirmava, com
estas palavras: *"apagar receita ou produto não apaga movimento nenhum"*, e travava o
zero com `assert.equal(tallyFor('products', counts).movements, 0)`. Crença errada com
asserção em volta é pior que crença errada solta: **ela convence quem passa a não
olhar** — e passou por mim quatro vezes, porque toda vez que abri este arquivo li a
afirmação e segui.

**O conserto** é uma contagem nova (`movementsOfProducts` — os movimentos que apontam
para item de produto, não o total, que seria a mentira oposta) e a medida que faltava:
um teste **contra o banco** que conta antes, apaga, conta depois, e exige que o número
anunciado seja o número perdido. Provado nos dois sentidos — com o conserto desfeito,
vermelho.

**A regra que sai daqui, e ela é sobre o achado e não sobre o erase:** quando uma
cicatriz é paga com um docblock que explica um caminho, pergunte **por quantos caminhos
o mesmo dano chega**. `DELETE` explícito e `ON DELETE CASCADE` fazem a mesma coisa ao
razão, e só o primeiro tem nome escrito no código.

## A guarda de órfãs lia COMENTÁRIO como chamada, e isso escondia quatro mortas

**Como apareceu.** Escrevi um docblock em `src/data/erase.ts` explicando que *"o
`serialize` ficava assim"* — e a guarda de exportações sem chamador reprovou dizendo que
`serialize` "ganhou chamador e continua na lista de fronteiras". Ele não ganhou: o motor
de sincronia continua exatamente sem chamador, esperando o transporte. O que aconteceu é
que a busca era sobre o **arquivo cru**, então a minha frase contava como uma chamada.

É a pior forma da família "régua que lê prosa como código", porque está virada para
dentro: **a guarda reclama de uma verdade porque alguém a explicou por escrito**, o que
ensina a não escrever a explicação. O `code()` que tira comentário já existia no mesmo
arquivo, usado pelo guarda do SQL. Faltava aqui.

**O que apareceu quando a prosa saiu da conta: quatro exportações mortas**, verdes há
meses porque o único lugar que dizia o nome delas era um comentário.

| | o que era | o que ficou |
|---|---|---|
| `__setDb` | gancho de teste, usado por três arquivos de teste | registrado com a razão, como o `__setOpener` já estava |
| `formatDate` · `formatWeekday` | dois formatadores de data sem uma tela | apagados — é o mesmo desfecho dos dois que a varredura de 6 de setembro tirou |
| `allocateCents` | repartição em partes IGUAIS, com invariante certa e teste | apagado pelo P1: a irmã por PESO (`allocateByWeight`) é a que a fábrica usa, e tem chamador |

**O `allocateCents` merece uma linha à parte**, porque apagar aritmética de dinheiro
correta parece errado. Ela não estava errada — estava sem quem a chamasse, com um teste
verde provando uma invariante que ninguém exercia. É exatamente a doença que o portão P1
existe para pegar, e a lista de vítimas dela neste repositório já tinha cinco nomes. O
git guarda a função se um dia alguém precisar dividir igualmente.

**A regra que sai daqui:** toda régua que procura um NOME dentro de arquivos tem de tirar
comentário antes. E o sinal de que uma está quebrada é este — ela reprova quando a
documentação melhora.

## A peça que marca "isto não tem volta" estava marcando o caminho de volta

**O que se viu.** O dono propôs uma regra: *"toda ação destrutiva requer uma confirmação,
toda ação irreversível deve requerer duas"*. Antes de aplicá-la, uma auditoria classificou
**82 atos por três lentes**. O primeiro achado não foi sobre a regra: foi sobre o eixo que
o aplicativo já usava.

O campo `destructive` da folha de confirmação diz, no docblock que existe desde que a
folha existe, que a forma centrada e vermelha é *"reservada para as ações que não podem
ser desfeitas"*. Ele estava ligado em **três estornos** — o único ato do aplicativo cujo
propósito inteiro é **ser** o caminho de volta — e em tirar um insumo de circulação, que o
mesmo botão traz de volta. **Dos seis lugares que o passavam, quatro tinham volta.**

Aplicar a regra do dono por cima desse sinalizador teria dado duas confirmações ao estorno
e deixado o Reset com uma. **A regra certa, no eixo errado, protege ao contrário.**

## E "irreversível" é o eixo errado neste sistema, o que é mais fundo

Num razão append-only, **irreversível é o caso NORMAL**. Toda produção, perda, contagem e
transferência fica para sempre — o gatilho do banco recusa apagar. Mas é **corrigível**: o
estorno põe o fato contrário ao lado.

Ao pé da letra, a regra poria o operador de luva confirmando **duas vezes por engradado**.
E aí acontece o que este arquivo já registrou noutra forma: *alerta inventado ensina a
ignorar alerta*. A pessoa cria o reflexo de passar batido, e no dia do Reset ela passa
batido também — **a regra teria destruído exatamente a proteção que queria criar.**

O eixo que ficou: **destrutivo → uma; irrecuperável → duas.** Trocar *irreversível* por
*irrecuperável* encolhe a lista das duas confirmações para pouquíssimos atos, e é isso que
faz a segunda significar alguma coisa quando aparecer.

Duas consequências que valem tanto quanto o eixo:

1. **A segunda folha tem de dizer coisa DIFERENTE da primeira.** Duas iguais são uma com
   fricção, e treinam o mesmo reflexo. A primeira diz o que vai acontecer; a segunda diz o
   que se perde e não volta, com os números.
2. **Onde existe volta de verdade, ela vale mais que um segundo toque.** O prazo de dez
   dias que o dono fixou para o Reset é a segunda rede — uma confirmação mais um caminho
   de volta visível é mais seguro que dois toques sem volta, porque toque vira memória
   muscular e prazo é fato.

**E onde um ato ROTINEIRO cai em irrecuperável, o conserto é construir a volta, não a
fricção.** A auditoria classificou "anotar a temperatura da câmara" como irrecuperável, e
tecnicamente acertou: não existe correção de leitura. Duas confirmações ali seriam o
desastre da câmara fria. O que falta é a leitura poder ser corrigida.

## Quatro defeitos que a segunda-feira de uma fábrica de verdade encontraria

O dono disse que vai testar na fábrica do pai. A régua mudou de *"o que falta construir"*
para **"o que quebra no primeiro dia"**, e o estudo do porte tinha medido quatro coisas
vivas. Consertadas, com a prova de cada uma:

| | o que acontecia | o que ficou |
|---|---|---|
| **o celular emprestado cadastrava lugar** | o servidor sempre recusou (`locations_manage` exige `manage_company`); o aparelho não conferia — a linha entrava na fila e travaria tudo depois dela. Quinta aparição da fila travada | `savePlace` recusa antes, com a razão; a tela não oferece o botão a quem não pode |
| **"acaba em N dias" errado por dois motivos** | saldo de UMA sala dividido pelo consumo de TODAS; e transferência para a própria loja contada como consumo — *"compre mais" porque você moveu* | `dailyOutflowOf` ganhou a sala e a regra da perna de transferência, que o irmão `runningOut` já tinha desde 7 de setembro |
| **"Fábrica" com a sobrelinha "ALMOXARIFADO"** | `ensureLocation` gravava `store_room`; e `factory`, primeira espécie do esquema desde a fundação, **não tinha um único escritor** | a sala padrão nasce `factory`; a V23 corrige quem já instalou |
| **renomear lugar não existia** | nenhuma tela mudava o nome; a sala padrão nasce com nome VAZIO e `savePlace` recusa vazio — então nenhuma edição dela era possível | "Renomear" em todo cartão, só para quem administra; é a porta por onde a sala padrão ganha nome de verdade |

**O achado transversal está na segunda linha, e é o mesmo de ontem noutra roupa:** a regra
da transferência foi medida, escrita e corrigida no `runningOut` — e `dailyOutflowOf`, que
nasceu dele e mora ao lado, ficou com o defeito. *Conserto que não termina no arquivo que o
mostrou*, agora em aritmética. Nenhum teste pegava nenhum dos dois lados, o que quer dizer
que a régua não existia; ela existe agora e mede da empresa e da sala.

**E um erro de método meu, registrado porque o gancho do repositório o pegou:** disparei a
foto com `&` dentro de um subshell em vez de `run_in_background`, fiquei sem notificação de
término, e tentei escrever um `until … sleep` para esperar o arquivo. O gancho `sem-espera`
recusou com a frase da cicatriz de 1h03. Regra que está escrita não impede; gancho impede.


## Olhos novos com teto de vinte minutos acharam quatro coisas que a barra inteira não viu

O dono pediu *"uma análise rápida (max 20min) com o modelo Fable"* para usar o resto do
limite semanal. A pergunta que eu dei ao agente não foi "o que falta" — foi **"o que quebra
na segunda-feira de manhã numa fábrica de verdade"**, seguindo o caminho do primeiro dia:
instalar, dar nome, cadastrar insumo, comprar, produzir, mandar carga, contar, entrar pela
grade. E a regra: medir, procurar a decisão antes de acusar, e dizer o que procurou e não
achou.

**Cinco achados, três provados com teste de fora, quatro consertados.** Nenhum deles é
"falta feature": todos são o app fazendo dano calado.

| passo | o que acontecia | prova |
|---|---|---|
| cadastrar insumo | uma embalagem inteira entrava no estoque e a confirmação calava — decisão escrita ("a primeira nota"), mas a tela não dizia | E3 |
| separação | mandava mais do que a fábrica tinha; a fábrica ficava **negativa** sem erro (50 kg → carrinho de 80 → −30 kg) | E3 |
| apagar tudo | com uma pessoa escolhida, o ponteiro ficava apontando para um fantasma → **zero permissões**, sem volta | E3 |
| grade de nomes | tocar não saía da grade quando ela era a única tela — a abertura chega nela assim | E1 → E3 pela checagem de navegador |

**O que faz esta rodada valer a linha, além dos consertos:**

1. **Dois testes passavam pelo motivo errado, e o piso novo os denunciou.** O da loja com
   duas réguas transferia dez picolés que ninguém tinha produzido — passava porque a
   fábrica podia ficar negativa. A régua nova (o piso da transferência) fez o teste
   contar a verdade: agora produz antes. É a família de sempre: suíte verde protegendo
   uma regra que ninguém pediu.

2. **A mesma regra em duas telas com duas respostas.** A transferência conferia o saldo;
   a separação comparava com o pedido. A resposta certa não é consertar a segunda tela —
   é subir a regra para onde as duas passam (`moveBetween`), como o piso da produção já
   faz. Uma terceira tela amanhã não reabre o buraco.

3. **O que ele procurou e NÃO achou vale tanto quanto o que achou**: a conta da compra
   (R$ 496 ÷ 40 kg = 1,24 c/g, confere), vírgula e ponto, produção com piso por sala,
   contagem que grava diferença, semeadura que não ressuscita. E ele deixou de listar duas
   coisas que pareciam defeito porque **achou a decisão registrada** — o consumo
   proporcional sem tacho declarado e o PIN sem senha. É o comportamento que o
   `CLAUDE.md` pede de mim e que eu mesmo falhei três vezes hoje.

**E o meu erro repetido, para ficar barato da próxima vez:** duas vezes na mesma hora eu
escrevi `assert s.count("    router.back();") == N` e a contagem veio maior porque a
string de quatro espaços é **substring** da de seis — o script abortava antes de escrever
e eu culpava o arquivo. Contagem de linha se ancora (`^\s*…$`, `re.M`), nunca por
substring. Já tinha acontecido com `"    router"` de manhã; virou regra só na segunda.

## Selector que acha pelo `.first()` acha pela ordem do desenho — e a ordem mudou

A checagem do preço combinado pedia o campo por `getByLabel(/morango/i).first()` e passou
por semanas. Ela quebrou hoje sem que ninguém tocasse no preço: o cartão do lugar ganhou a
lista do que ele guarda, e a primeira coisa da página a falar de morango passou a ser a
**linha da polpa** — que não é campo nenhum, então o `fill` estourou em vez de escrever.

O defeito não é a linha nova; é a checagem ter dito *"alguma coisa que fale de morango"*
quando o que ela queria era *"a caixa de texto do preço do picolé"*. Trocada por
`getByRole('textbox', { name: /morango/i })`, ela volta a medir a costura que existe para
medir — o que a tela guarda, manda e lê de volta — e para de depender de quem desenha
primeiro. **Onde um `.first()` decide QUAL elemento, a asserção está amarrada ao layout**, e
layout muda a cada tela nova.

## A guarda que semeava a própria condição — e três formas do mesmo defeito num dia

O dono nomeou quatro quebras de porte. Doze agentes as mediram, três atacaram cada
resposta, e o veredito foi que **três das quatro não eram porte**: transportadora é cadastro
barato, a grade com duzentos nomes é urgência fabricada (`people` é dimensão, não razão), e a
segunda fábrica não é urgente porque nenhuma tela oferece a espécie. A quarta não espera porte
nenhum: **a empresa deste aparelho era uma constante compilada**, o uuid que o servidor devolve
ao criar a empresa era descartado, e a primeira subida seria recusada em bloco com UM aparelho
e UMA fábrica.

**Por que 470 testes, 19 garantias de banco e 51 checagens de navegador não viram isso.** A
checagem 6 do `db:verify` — a que reproduz a fila do aparelho contra um Postgres de verdade,
sob RLS — **inseria no servidor uma empresa com exatamente o id compilado do aparelho**, e o id
da CONTA era o mesmo número. Um uuid fazendo três papéis. Ela provava que as colunas batem e
absolutamente nada sobre o servidor aceitar uma fila carimbada por uma empresa que ele conhece.
É a família já registrada aqui — *guarda que compara duas coisas escritas pela mesma mão* —
numa forma nova: **a guarda que FABRICA a condição que esconde o defeito.** A pergunta que a
pega: *de onde vem o valor que esta checagem usa como premissa?* Se a resposta é "deste mesmo
arquivo", não há checagem. Agora o aparelho adota uma empresa, imprime qual, a shell lê dali —
e recusa se ela for igual à conta.

**E a mesma forma apareceu duas vezes mais na mesma rodada, o que é o que a torna um padrão:**

1. **A verificação do teste usava a régua do código.** Os oito testes da adoção passaram de
   primeira, então quebrei a adoção em quatro lugares para ver se mordiam. Uma mordida —
   excluir uma tabela da varredura — **passou verde**, porque o teste conferia o resultado
   chamando a mesma função que a adoção usa: excluir a tabela da régua a excluía da
   conferência junto. A varredura do teste passou a ler o esquema por conta própria.
2. **O "flake" que era empate.** Um teste de estorno falhou uma vez em três com a máquina
   ocupada. Ele pedia *"a última perna por `recorded_at`"* — e as duas pernas caem no mesmo
   milissegundo sob carga. **Empate em `ORDER BY` é sorteio**, e a lição estava escrita vinte
   linhas acima no mesmo arquivo (escolher pelo fato que o teste afirma, não pela ordem).
   Flake não é causa raiz: era ambiguidade minha.

**A formatação que não sabe a língua da cadeia de caracteres não é cosmética.** Rodei
`npx prettier --write` em seis arquivos — e este repositório **não tem configuração de
prettier**. Valeu o padrão da ferramenta: aspas duplas, oitenta colunas, 6.823 linhas de diff
para uma mudança de duzentas, e um guarda de tela reprovando porque o arquivo virou outro
arquivo. Ao desfazer, a varredura que trazia as aspas de volta trocou `SELECT "table", "from"`
por `SELECT 'table', 'from'`: em SQL aspa dupla é **identificador** e aspa simples é **texto**,
então a consulta passou a devolver as duas palavras em vez das duas colunas — a lista de filhos
do lugar voltou vazia e a adoção morreu na chave estrangeira. Quem pegou foi a suíte.

**E o conserto que causava o defeito que ele existia para impedir.** A configuração da empresa
sobe quando o dono mexe num interruptor e falha calada sem rede — correto, porque a mudança já
vale naquele celular. Faltava a metade de baixo: a descida escrevia o valor velho do servidor
por cima, e o interruptor voltava sozinho. Construí a marca de "não subiu ainda"… e no teste
descobri que, depois de subir o pendente, eu **continuava descendo na mesma rodada** — e a
resposta pode ter sido montada antes da minha escrita. O conserto reintroduzia a perda. A
descida para ali agora. Para nada disso ser possível de testar antes, havia um motivo
estrutural: o arquivo importava o cliente do servidor no topo, o cliente arrasta o React
Native, e o React Native não atravessa o transformador da suíte — **um arquivo inteiro sobre
comportamento de rede, sem uma linha de teste, e ninguém tinha perguntado por quê.**

## Migração não se prova com teste — e a checagem que passa pelo motivo errado agora tem terceira forma

**Três defeitos numa migração de vinte linhas, e 495 testes verdes por cima deles.** A
`0044` (transportadora) foi empurrada com expressão dentro de `unique (...)` de tabela — que
em Postgres só existe em índice, e a `0018` já tinha resolvido o mesmo caso quatro migrações
antes —, com duas ajudantes de política chamadas sem o esquema `private` (a forma da `0001`,
revogada na `0005`), e sem o `grant insert, update` para o papel do aplicativo, cuja falta faz
o servidor recusar **a fila inteira** por permissão.

Nenhum dos três é visível de dentro do aparelho: o SQLite não tem política, não tem esquema e
não tem papel. O `typecheck` passou, os 495 testes passaram, o portão passou. Quem pegou foi o
`db:verify`, um por execução — e ele pegou um quarto, que é dele mesmo: a sessão do aparelho
tem guarda de completude, então tabela que atravessa e não é exercitada **reprova a
execução**. Daí a linha nova na barra do `CLAUDE.md`: *migração roda `db:verify`*, e ele leva
um minuto.

**A terceira forma da checagem que passa pelo motivo errado, e esta era minha, de ontem.** A
checagem *"tocar num nome sai da grade"* pedia `getByRole('button').first()` numa instalação
virgem. O exemplo semeado **não cadastra gente** — então o único botão da tela era o do estado
vazio, que leva para "Pessoas". A URL mudava, a asserção passava, e nenhum nome havia sido
tocado: o defeito que ela existe para pegar (a grade aberta como única rota, que é a abertura
do aplicativo) nunca era exercitado.

As três formas que este dia mostrou, juntas, porque elas se parecem e enganam por motivos
diferentes:

| forma | o que a torna verde | o que a pega |
|---|---|---|
| a guarda que **semeia a própria condição** (checagem 6 com o id compilado do aparelho) | premissa escrita pela mesma mão que a checa | perguntar de onde vem o valor que ela usa como premissa |
| a verificação que usa **a régua do código** (o teste da adoção chamando `tabelasComEmpresa`) | excluir da régua exclui da conferência junto | a segunda fonte ser lida de novo, não reusada |
| o seletor que acha **outra coisa** (o botão do estado vazio no lugar do nome) | a asserção é sobre o efeito, e o efeito acontece por outro caminho | tocar pelo RÓTULO do que se afirma, e afirmar o que está na tela antes |

**E duas afirmações do estudo de porte caíram ao serem medidas** — as duas ditas com
confiança por agentes, as duas erradas: `puxar` e `empurrar` têm chamador (a configuração
desce quando a Conta abre), e **nenhum dos dois lados exige nome único de gente** (o servidor
tem índice, não restrição), então homônimo não travava fila alguma. O que a grade precisava
não era unicidade: era busca. Achado de agente é hipótese até passar pelo `grep`.

## O fornecedor tem duas formas, e só uma viaja — a armadilha que espera o item que ainda não existe

Varredura de tabelas do servidor sem escritor, 8 de setembro. Das 28, seis não atravessam:
quatro por bom motivo (`companies` e `memberships` nascem por função do servidor;
`item_costs` e `item_cost_history` são derivadas e o servidor é o dono delas) e duas por
outro: `devices` — que tem fronteira escrita, esperando matrícula de aparelho — e
**`suppliers`**, que está no esquema desde a `0002` com zero escritores e zero leitores.

O achado não é *"tabela morta"*, que já estava documentado em dois docblocks. É o que ela faz
com um item que **ainda não foi construído**: as compras inteligentes dependem do **prazo
observado por fornecedor**, e o fornecedor que existe de verdade é um NOME digitado
(`purchases.supplier_name`). Agrupar por nome faz *"Distribuidora Silva"* e *"distribuidora
silva"* virarem dois fornecedores com metade das entregas cada — e o prazo sai pela metade,
plausível, sem nada acusando.

**É a mesma armadilha que a transportadora evitou por acidente feliz:** `carriers` nasceu com
índice único por `lower(trim(name))` porque eu estava olhando para `suppliers` na hora de
decidir, e o que me fez olhar foi a regra da casa de não copiar molde sem chamador. Um passo
adiante e eu teria copiado a forma que cria o problema.

A consequência é uma linha no plano, ao lado do item que ela vai morder — não código, porque
o item espera o mundo. **Achado que muda um documento é achado; achado que vira código antes
da hora é a doença que este repositório documenta em quatro lugares.**

## A régua do `unzip -l` mede o cru — eu culpei a câmera por quinze megabytes que eram um ajuste apagado

O APK com câmera saiu com 57,4 MB e não coube no canal de entrega, que aceita 30. Medi a
composição com `unzip -l | awk` e li: dex de 15,6 MB para 55,6 MB. Diagnóstico pronto —
o `expo-camera` empacota os modelos do ML Kit, e a conta fecha.

**Fechava com o número errado.** `unzip -l` imprime o tamanho **descompactado**; o que não
cabe no canal é o arquivo, e o arquivo é o compactado. Medindo `compress_size`, a conta é
outra: `lib/arm64-v8a` foi de 7,6 para **27,4 MB** e o dex de 6,3 para 20,0 MB. E dentro do
`lib` a assinatura do defeito estava à vista — `compress_size == file_size` em toda
biblioteca nativa, ou seja **guardadas sem compressão**. Só `libreactnative.so` passou de
2,2 MB para 6,7 MB sendo exatamente o mesmo arquivo.

A causa é `expo.useLegacyPackaging=false`, o padrão do Expo, que o `expo prebuild` reescreveu
em `android/gradle.properties` — pasta gerada, ignorada pelo git, onde eu tinha ajustado à
mão dois dias antes. A câmera custou de fato ~5,5 MB (`libbarhopper_v3.so` e os modelos);
os outros ~15 eram um ajuste meu que o `prebuild` apagou porque **ele não morava em lugar
nenhum que sobrevivesse**.

Duas regras saem disso, e a segunda vale mais que a primeira:

1. **Ajuste de compilação que não está no `app.json` não existe.** `android/` é saída, não
   fonte. O que precisa durar entra por `expo-build-properties` — que é onde
   `useLegacyPackaging`, `enableMinifyInReleaseBuilds` e `enableShrinkResources...` passaram
   a morar.
2. **Toda régua descartável responde a uma pergunta específica, e a pergunta aqui era "quantos
   bytes eu envio".** `unzip -l` responde outra ("quantos bytes o aparelho carrega na
   memória"), e as duas são legítimas — o erro foi não perguntar qual delas eu queria. É a
   mesma família do `assert.ok(> 0)`: a medida rodou, deu número, e o número não era do que
   eu estava perguntando. **Antes de crer numa medida, diga em voz alta a unidade dela.**

## O emulador morre calado e o sintoma acusa o artefato que está sendo testado

8 de setembro, minutos depois de ligar o R8. A instalação do APK minificado falhou com
`Failure calling service package: Broken pipe (32)`, e a leitura óbvia era a que eu
estava justamente procurando: *a minificação quebrou o pacote*. Eu tinha acabado de
mexer no empacotamento, tinha o número do dex caindo de 20 MB para 7,4, e um erro de
instalação na mão — três coisas alinhadas para a conclusão errada.

`adb shell pm list packages` respondeu `Can't find service: package`. O serviço não
recusou o APK: **ele não existia**. O `system_server` do emulador havia morrido durante
os quinze minutos em que a compilação ocupou os quatro núcleos — o mesmo emulador que
`adb devices` continuava listando como `device`, porque o `adbd` sobrevive à morte do
framework e responde por um aparelho que não tem mais Android em cima.

Três coisas ficam:

1. **`adb devices` dizendo `device` não é prova de aparelho vivo.** O que prova é
   `getprop sys.boot_completed` valer `1` **e** um serviço do framework responder
   (`pm list packages`, `wm density`). Duas perguntas, porque a primeira já voltou
   vazia com o aparelho listado.
2. **Não compile e emule ao mesmo tempo numa máquina de quatro núcleos.** O `CLAUDE.md`
   já registra o custo disso em disputa de CPU; o que ele não dizia é que o emulador
   não sobrevive — ele não fica lento, ele morre.
3. **E a regra de leitura, que é a que vale:** quando um erro aparece no minuto seguinte
   a uma mudança, a mudança é a suspeita mais barata e não a mais provável. Antes de
   acusá-la, **pergunte se a ferramenta que mediu está viva** — é a mesma família do
   `wm density` preso em 240 dpi, onde o instrumento mentia e a foto não avisava.

## O tipo existia, a implementação não — e o typecheck garante a forma, nunca a plataforma

8 de setembro. A leitura de etiqueta por câmera ficou pronta, passou por typecheck, 508
testes, mutação, navegador e portão, e **não existia no aparelho**: o botão que leva a
ela nunca apareceu.

`app/(tabs)/production.tsx` perguntava `CameraView.isAvailableAsync()` para só oferecer a
câmera onde há câmera — que é a Lei 5 desta casa aplicada certo, e é justamente por
parecer certo que atravessou. A função é implementada no expo-camera **da web**;
`CameraViewModule.kt` declara quinze funções e nenhuma com esse nome. No Android o JS
lança `UnavailabilityError`, o `.catch` — escrito para o caso *"aparelho que nem sabe
responder não tem"* — lia a exceção como resposta negativa, e desligava o botão em todo
telefone e todo tablet.

**A lição não é sobre câmera.** É sobre o que cada rede pega:

- **O typecheck viu um tipo, e o tipo estava lá.** `expo-camera` declara
  `isAvailableAsync` no `.d.ts` porque a API é a mesma nas três plataformas; o que muda
  é qual delas tem alguém do outro lado. Tipagem descreve **forma**, e a existência de
  uma implementação nativa não é forma.
- **O teste unitário não abre pacote nativo**, o navegador do `e2e` roda justamente a
  plataforma onde a função EXISTE, e a foto do emulador — que é a régua desta casa para
  tela — não tinha sido tirada ainda, porque o APK não coubera no canal de entrega.
  Quatro redes, e o buraco delas se alinhou.
- **E o `catch` genérico foi o cúmplice.** Ele tratava "não sei responder" como "não
  tem", que é a leitura conservadora e parece prudente. Mas um `catch` que converte
  falha de mecanismo em resposta de negócio apaga a diferença entre *"não há câmera"* e
  *"esta pergunta não existe aqui"* — e a segunda é defeito de código, não fato do
  mundo.

O que mudou: a pergunta passou a ser feita só na web, e uma guarda em `src/layers.test.ts`
lê a lista de funções direto do `CameraViewModule.kt` e reprova qualquer chamada de
`CameraView` que o Android não tenha, salvo quando o arquivo pergunta `Platform.OS`.
Ela é derivada da fonte que não passou pela minha mão — a regra irmã, já escrita aqui,
diz por que isso importa: guarda que compara duas coisas escritas pela mesma mão não
guarda nada.


## Duas medidas erradas seguidas sobre a mesma coisa, e a segunda foi pior que a primeira

8 de setembro, decidindo se o encolhimento de recursos do Android valia o risco.

**Primeira medida:** comparei o APK com R8 e encolhimento contra o APK sem nenhum dos
dois, vi 0,29 MB de diferença em `res/` e creditei ao encolhimento. Dois builds que
diferiam em **duas** coisas, e eu atribuí o delta a uma.

**Segunda medida, que eu escrevi como CORREÇÃO da primeira:** rodei um `grep` por
*"Removed unused resource"* no `resources.txt` que o próprio shrinker deixa, ele voltou
zero, e eu li zero como *"não removeu nada"* — e reescrevi o docblock, o commit e a
mensagem ao dono dizendo que o encolhimento pagava zero.

Aquele arquivo não é registro de remoção: é o modelo de uso que o shrinker monta. O
padrão nunca ia casar. **Padrão que não casa não prova ausência — prova que ninguém
conferiu o padrão.** É exatamente a família do `assert.ok(valor > 0)` já registrada
aqui: a régua rodou, deu um número, e o número não respondia a pergunta feita.

O que decidiu foi a comparação que isola **uma** variável: com R8 e sem encolher, `res/`
tem os mesmos 1005 arquivos e a mesma tabela de 1,70 MB do build sem R8 nenhum. Com o
encolhimento, 911 arquivos e 1,44 MB. O R8 não toca em recurso; quem tira é o
encolhimento, e tirou 94. A primeira medida estava certa pelo motivo errado.

**E a parte que mais importa, porque não é sobre Android:** a segunda medida veio de um
relatório de subagente que eu tinha pedido justamente para verificar. Ele afirmou "risco
eliminado, zero recursos removidos", eu confirmei com um `grep` meu que concordava, e as
duas coisas erradas concordando pareceram prova. Verificação que consulta a mesma
evidência frágil não é segunda opinião — é a primeira, repetida. O que quebrou o empate
foi construir o caso de controle: um build que difere em uma variável só.

## A guarda reprovou dizendo que os dois números concordavam

8 de setembro, ao acrescentar a 22ª garantia do `db:verify`. Duas guardas do
`src/bar.test.ts` ficaram vermelhas, e a mensagem de uma delas dizia: *"o db:verify tem
22 garantias e o CLAUDE.md diz 'vinte e duas'"* — os dois certos, e reprovando.

O defeito era da régua: a tabela `POR_EXTENSO` tinha sido escrita até `'vinte e uma'`,
que era o número do dia em que ela nasceu. Com 22 garantias, `POR_EXTENSO[22]` é
`undefined`, a lista de grafias aceitas fica `[undefined]`, e nada casa. A mensagem
imprimia o algarismo e a grafia encontrada **sem dizer que a grafia esperada não
existia** — então ela descrevia uma discordância que não era a real.

Custou uma rodada procurando defeito na mudança em vez de na régua. E é a família do
`grep` que não casa: **a asserção rodou, deu vermelho, e o vermelho apontava para o
lugar errado.** Uma guarda que não sabe distinguir *"os dois discordam"* de *"eu não sei
avaliar isto"* transforma um conserto de uma linha numa investigação.

O que mudou: a guarda agora falha primeiro com *"só sei escrever até 21, acrescente a
grafia — o defeito é aqui, não no script"*, e a segunda mensagem passou a dizer qual
grafia ela esperava. A tabela ganhou até 25, que é folga e não conserto — o conserto é a
mensagem.

**A regra que sai daqui, e ela vale para toda guarda desta casa:** a mensagem de recusa
tem de distinguir *o alvo está errado* de *eu não consigo julgar o alvo*. As duas são
vermelhas e mandam a pessoa para lados opostos.

## Somar de menos é mais silencioso que somar de mais — e foi por isso que o parâmetro virou dois

8 de setembro, recortando as consultas de saldo por unidade de fábrica. O defeito de
partida era somar de MAIS: com duas unidades, *"dá para prometer este pedido?"* contava o
freezer da outra cidade. Óbvio de contar e óbvio de consertar.

O que apareceu no caminho foi o defeito espelho, e ele é pior. `listItems` tinha um
`locationId` opcional que respondia UMA pergunta — o saldo daquela prateleira exata. Se
eu passasse a unidade nesse mesmo parâmetro, a soma sairia só do pátio da fábrica e
**deixaria a câmara fria de fora**. Uma fábrica de picolés guarda o picolé na câmara: o
número certo é 210 e sairia 10.

**Os dois erros têm a mesma causa e visibilidades opostas.** Somar de mais produz um
número grande, e número grande contra a memória de quem trabalha ali salta aos olhos:
*"não tenho tudo isso"*. Somar de menos produz um número pequeno, e número pequeno lê
como **prudência** — ninguém desconfia de um sistema que diz ter menos do que tem. A
consequência é uma fábrica que produz o que já tinha, ou que recusa um pedido que dava
para atender.

Daí a forma: o parâmetro deixou de ser um id e passou a ser `{ sala }` **ou**
`{ unidade }`, com o tipo impedindo passar um pelo outro. Não é elegância — é que as duas
perguntas são diferentes o suficiente para um mesmo campo responder a errada em silêncio.

**E a linha-irmã, achada por um teste no minuto seguinte:** a unidade padrão de uma
empresa **nasce no primeiro movimento** (`ensureLocation`), não na instalação. Então
qualquer coisa que aponte para ela antes disso quebra — cadastrar uma câmara fria num
aparelho novo derrubava a tela com `FOREIGN KEY constraint failed`, que é o caminho normal
de quem instala e cadastra as salas antes de lançar nota. Linha criada por preguiça
(*lazy*) é linha que existe **depois** de alguém precisar dela, e quem a referencia tem de
garanti-la primeiro. O padrão está no repositório desde a fundação; o que faltava era
alguém apontar para ele de um lugar novo.

## O atalho de compatibilidade tem de espelhar o `WHERE` do backfill — exatamente

8 de setembro, recortando as consultas de saldo por unidade de fábrica. A migração 0046
acrescentou `parent_location_id` e fez um backfill: **sala interna existente passa a
apontar para a unidade que tem o id da empresa** — sem isso, recortar por unidade
excluiria a câmara fria de quem já tem o aplicativo instalado, e o saldo cairia calado.

Para o SQL não depender de o backfill ter rodado, escrevi um atalho:
`COALESCE(parent_location_id, company_id) = <a unidade>` — *"sala sem pai pertence à
primeira unidade"*. Ele diz o que o backfill afirma, e é uma linha.

**Ele estava largo, e dois testes o pegaram, um por vez.**

1. Uma **segunda unidade** não tem pai (uma fábrica não fica dentro de outra), então o
   atalho a punha dentro da primeira: o freezer de Marília aparecia como estoque de
   Bauru. Corrigi excluindo a espécie `factory`.
2. Uma **loja** também não tem pai, e caiu no mesmo lugar: o lote já entregue continuava
   avisando de validade, que é justamente o alerta que este projeto documenta como o que
   ensina a ignorar alerta.

Duas correções da mesma linha em vinte minutos, cada uma achada por uma asserção
diferente. E a segunda mostrou qual era o defeito de raciocínio: eu estava escrevendo o
atalho a partir do que ele **deveria significar** ("sem pai é daqui"), corrigindo por
exceção conforme os contra-exemplos apareciam. Exceção acumulada é a forma que erra na
terceira.

**A regra é derivar, não descrever:** o atalho existe para cobrir as linhas que o
backfill tocaria, então a condição dele é o `WHERE` do backfill, copiado. O backfill diz
`kind in ('cold_room','store_room')`; o atalho passou a dizer a mesma coisa, lendo a
lista da mesma constante do domínio. Fábrica, loja, cliente e veículo ficam de fora
porque o backfill não os tocou — e isso deixa de ser exceção lembrada para ser
consequência.

**O que isso vale além daqui:** toda coluna nova com backfill tem um par — a leitura que
tolera a ausência do valor. Os dois são a mesma afirmação escrita duas vezes, num
arquivo de migração e numa consulta, e a segunda não se escreve de memória. Se elas
divergirem, o número muda para quem instalou antes e não muda para quem instalou depois,
que é a classe de defeito mais difícil de reproduzir que existe.

## Mutação que aponta para uma cópia envelhece toda vez que a cópia muda

8 de setembro, três vezes no mesmo dia. Toda vez que uma consulta mudou, mutações do
`scripts/mutate.mjs` deixaram de encontrar o trecho que elas trocam — e o script conta
isso como **sobrevivente**, com razão: régua que não acha o alvo não prova nada, e um
relatório que diz "pego" sem ter aplicado a troca é verde por construção.

O primeiro reflexo foi errado: eu consertava o texto de cada mutação para o texto novo. Na
terceira vez ficou visível o que estava acontecendo — **as mutações apontavam para cópias
da mesma regra.** Cinco consultas tinham o mesmo recorte de lugar escrito cinco vezes, e
cada cópia precisava da sua mutação. Isso não é problema do `mutate`: é o mesmo defeito que
este repositório já documenta em prosa (*"predicado escrito três vezes é a forma que produz
divergência"*), aparecendo do lado de fora.

Quando as cinco passaram a ler de uma peça só (`noEscopo`), **uma mutação passou a cobrir
as cinco** — e ela é mais forte que as cinco anteriores juntas, porque a regra agora só
existe num lugar e a troca alcança todos os leitores.

**A régua que fica:** quando duas mutações precisam do mesmo defeito escrito de dois jeitos,
o defeito não está no arquivo de mutações. Está no código, e o `mutate.mjs` acabou de
apontar para ele — do mesmo jeito que um teste difícil de escrever costuma estar dizendo
que o desenho está errado.

E a de operação, que custou uma rodada: **`npm run mutate | tail` mente duas vezes.** O cano
corta a lista dos sobreviventes (que é o que se precisa ler) e troca o código de saída pelo
do `tail` — o script sai 1 quando há sobrevivente, e eu li 0 e segui em frente. Relatório
longo se guarda em arquivo e se lê com `grep`, nunca se canaliza por `tail`.

## Guarda que confere a ARIDADE não confere o escopo — e a minha passou verde no dia em que o argumento trocou de significado

8 de setembro, achado por uma pergunta do dono. Ele perguntou o que era "sala do tacho" —
um termo que eu inventei e que não existe em lugar nenhum do repositório — e ao ir conferir
o que o código de fato faz, o defeito apareceu.

`recordProduction` confere o piso ANTES de escrever, e tem quatro parágrafos de razão ao
lado explicando por que o piso não pode ser o da empresa. `app/production/new.tsx` tem uma
guarda dedicada em `src/layers.test.ts` para impedir que a tela leia um piso diferente do
que a escrita confere — a cicatriz está escrita: *"a tela dizia que havia polpa, liberava o
botão, e toda corrida batia no piso do livro-razão com um erro de programador em inglês"*.

No dia em que o saldo ganhou escopo de unidade, eu troquei a tela de
`listItems(co, undefined, false, sala)` para `{ unidade: unidadeDaqui() }` e **não toquei na
escrita**, que continuou conferindo `m.location_id = ?` — uma sala. Com a polpa na câmara
fria, que é onde polpa mora numa fábrica de picolés, o botão liberava e a escrita recusava.
O defeito exato que a guarda existe para impedir, uma casa mais estreito — e **pior** que o
original, porque a tela já mostrava em que sala a polpa estava: sabia onde, e não deixava
rodar.

A guarda não viu porque ela contava argumentos: *"tem o quarto?"*. Tinha. Ela nunca soube o
que a escrita confere, então não tinha como comparar. **Aridade não é escopo** — e uma
guarda que mede a FORMA de um lado nunca guarda um acordo entre dois lados.

O que ficou:

1. O piso passou a ser o da **unidade**, que é a régua que responde *"dá para ir buscar a
   pé"* — a câmara fica a três metros, a loja a dez quilômetros, a outra fábrica em outra
   cidade. É a mesma régua da `0046`, agora dos dois lados.
2. O consumo passou a sair **da sala que tinha o insumo**, uma linha por (insumo, sala).
   Debitar tudo do piso do tacho fecharia a soma por unidade e mentiria por sala — e é a
   sala que alguém confere com os olhos na segunda-feira.
3. **A alocação virou a checagem.** O que falta é o que a alocação não conseguiu tirar de
   sala nenhuma; não existe segundo número para divergir do primeiro. O defeito nasceu de
   duas leituras da mesma pergunta, e o conserto foi apagar a segunda leitura.
4. A guarda passou a **derivar o escopo do corpo de `recordProduction`** em vez de conferir
   a forma da chamada, com positivo e negativo para as três respostas possíveis (sala,
   unidade, empresa). Se alguém estreitar ou alargar o piso lá, o teste passa a exigir a
   mesma palavra das telas no mesmo commit.

**E a régua de leitura que sai daqui, que é maior que o defeito:** quando uma guarda existe
para casar duas leituras, ela tem de ler as DUAS. A regra irmã já estava escrita neste
arquivo — *"uma guarda que compara duas coisas escritas pela mesma mão não guarda nada"* — e
esta é a variação dela que faltava: uma guarda que compara duas coisas mas só LÊ uma delas
não guarda nada, e é ainda mais convincente, porque ela tem o nome certo, a cicatriz certa
escrita no docblock, e passa verde.

**E o menor dos achados, que é do tom de voz:** eu levei uma pergunta ao dono usando um
termo que eu mesmo inventei ("a sala do tacho"), sobre uma decisão que o código já tinha
tomado em dois lugares diferentes e contraditórios. A pergunta certa não era qual é o
padrão: era conferir o que o sistema faz antes de perguntar. O `CLAUDE.md` já manda medir a
afirmação do item contra o código antes de construir — vale igual antes de **perguntar**.

## Vocabulário chumbado é regra chumbada, e compila

8 de setembro. Eu levei ao dono uma pergunta usando *"a sala do tacho"*, e a resposta
dele foi *"que droga é essa de tacho?!"*. O termo era invenção minha para a pergunta —
mas ao conferir, o repositório **inteiro** falava assim, e não só nos comentários:
quatro frases de tela em português (*"do tacho à caixa"*, *"sem tacho aberto"*, *"o que
saiu do tacho"*), três em inglês (*vat*, *the pot*) e seis em espanhol (*paila*).

O `CLAUDE.md` já dizia, na primeira linha: *"nada de regra chumbada de sorvete"*. Eu li
isso durante meses como uma regra sobre **lógica** — não codificar prazo de validade de
picolé, não presumir câmara fria. **É também uma regra sobre PALAVRA**, e a versão em
palavra é mais difícil de ver porque ela compila, passa em 554 testes e fica bonita na
foto: *tacho* é a panela em que se cozinha a mistura, existe numa fábrica de picolés, e
não existe em metade das fábricas que vão instalar isto. Quem faz sabonete, ração ou
pão de queijo abre a capa e lê o nome de um equipamento que não tem.

É a mesma família das três árvores e dois pássaros que ele recusou no cabeçalho de
Ajustes, e a régua que sai é a mesma virada para o texto: **diga o que ACONTECE, nunca
em que equipamento aconteceu.** "Produção em curso" serve para as duas fábricas;
"Tachos abertos" serve para uma.

**O que mudou:** as treze frases nos três idiomas, e um guard em `src/dictionary.test.ts`
que reprova a volta de qualquer nome de equipamento em qualquer idioma — com positivo e
negativo, porque `\b` contra substring é o que separa a régua de um alarme que acusa
*private*, *innovative* e *spot*. É o par de conteúdo do que o `Widen<T>` já faz pela
forma: chave nova quebra a compilação, palavra proibida quebra a suíte. Correção sem
guard dura uma sessão.

**E a régua de leitura, que é maior que a palavra:** quando o dono recusa um termo, a
pergunta não é *"troco onde ele viu?"* — é *`grep` pelo termo no repositório inteiro*.
Ele viu num lugar; eu tinha escrito em treze. Essa regra já estava escrita aqui para
PELE (*"conserto de pele não termina no arquivo que o mostrou"*), e vale igual para
vocabulário.

## O SQLite não tem política — e por isso a venda nova travaria a fila inteira

8 de setembro, achado pelo `db:verify` e por nada mais.

Ao dar escritor a `movement_kind = 'sale'` (a contagem de uma loja própria deduz a
venda), eu escrevi a garantia 23 ANTES do conserto, para ver o que o Postgres diria. Ela
falhou com a frase certa: **quem conta não conseguiu gravar a venda que a contagem dele
descobriu.**

A causa é uma decisão de 2024 que estava certa quando foi tomada. A `0001` gateou
`sale` em `dispatch`, porque a única venda imaginável era carregar mercadoria para um
cliente — e quem carrega despacha. A `0008` reescreveu a política inteira por outro
motivo e manteve a linha, corretamente: nada tinha mudado sobre a venda. Mudou agora: a
mesma linha do razão passou a ter **duas origens**, e a segunda é autorizada por outra
capacidade — quem conta a prateleira tem `adjust_stock`. O Conferente
(`check_receipt` + `adjust_stock`, sem `dispatch`) é exatamente o perfil de quem fica no
balcão.

**E o defeito é do pior tipo que este repositório conhece**, o mesmo que já apareceu
quatro vezes: a contagem é aceita no celular, a linha entra na fila, o servidor a recusa
por permissão, e tudo o que a fábrica gravar depois fica preso atrás dela. Os 554 testes
do aparelho passariam para sempre — **o SQLite não tem política, não tem papel e não tem
capacidade**, então lá a linha entra.

**A régua que fica:** dar escritor a uma coluna ou a uma espécie que existia sem escritor
não é "usar o que já estava lá". É uma pergunta nova para o servidor, e ela é sobre
QUEM — quase nunca sobre a coluna. Antes de escrever a primeira linha de um `kind` que
nunca foi escrito, leia a política de `insert` dele e pergunte se quem vai escrever
agora é quem ela imaginava. E escreva a garantia antes do conserto: uma garantia que
nasce verde não prova que fecha o buraco, prova que o buraco talvez nunca tenha existido.

## Decidir sob defeito é decidir — e fecha metade da regra, nunca ela inteira

8 de setembro. O roadmap tinha uma seção inteira oferecendo dois mundos legítimos para
de onde a produção consome — "sala estrita" e "salas somadas" — e chamando a escolha de
decisão de padrão do dono, travada no portão P3.

Ao consertar o defeito do dia descobri que **não havia dois mundos: havia um quebrado.**
A tela lia o piso da unidade e a escrita conferia uma sala, então com a polpa na câmara
fria nenhuma corrida rodava. A "sala estrita" que a seção dava como *o comportamento de
hoje* nunca funcionou de verdade — ela funcionava só para quem tinha uma sala só, que é
o caso em que as duas opções são a mesma.

Consertar exigia escolher, e eu escolhi: o padrão passou a ser a unidade. Foi a escolha
certa (a outra obrigaria a lançar transferência antes de cada corrida, e a própria seção
já dizia que *"nenhuma fábrica de seis pessoas faz isso"*), e ela foi minha, não do dono.

**O erro não foi decidir — foi dizer que a pergunta tinha morrido.** A regra da casa não
é *"escolha um padrão"*: é *"os dois caminhos existem, e o que se decide é o padrão"*. Ao
fixar o padrão eu fechei **metade** da regra e declarei o item encerrado. A sala estrita
continua sem existir como configuração, e uma fábrica que queira saldo por sala sempre
declarado não tem como pedir.

**A régua que fica:** quando um defeito força a mão, o padrão é meu e se diz em voz alta;
o item **não** fecha — ele muda de forma, de *"qual é o padrão?"* para *"falta o outro
caminho"*, e a medida do plano muda junto (`espera` vira `ausente`, apontando para a peça
que ainda não existe). Item que fecha porque o padrão foi escolhido é a regra da
configuração morrendo em silêncio, com o commit verde.

E a irmã disso, do mesmo dia: **a pergunta que eu levo ao dono pode já estar morta, e
quem a mata é o código.** Eu perguntei *"qual é o padrão da sala do tacho?"* sobre uma
coisa que o repositório já decidia — de dois jeitos contraditórios, em dois arquivos que
não se olhavam. Medir a afirmação contra o código antes de construir já era regra aqui;
vale igual, e é mais barato, antes de **perguntar**.

## Duas guardas discordando é o relatório de defeito mais barato que existe

8 de setembro, à noite. Acrescentei uma renúncia (`NAO_E_DICIONARIO`) para um texto que o
`e2e` **usa**, e a guarda irmã — a que exige que toda renúncia continue em uso — reprovou
dizendo *"está na lista e o e2e não o usa mais"*.

As duas não podiam estar certas. A errada era a que eu não estava olhando: o extrator de
literais lia `getByText('X', { exact: true })` e `getByLabel('X')` — e **não**
`getByLabel('X', { exact: true })`. O `{ exact: true }` era obrigatório numa forma e
proibido na outra, sem razão nenhuma, e ninguém tinha usado a combinação que faltava até
hoje.

O buraco importa mais do que parece, e a razão é a semântica do Playwright:
`getByLabel` **sem** `exact` casa por substring. Ou seja, o dia em que alguém precisa de
exatidão num rótulo é justamente o dia em que dois rótulos se parecem — e é nesse dia que
o seletor sai do alcance da guarda. Ela ficava cega exatamente onde faria mais falta.

Consertado o extrator, **cinco literais que escapavam desde sempre apareceram**:
`Palito de picolé`, `Glucose 38DE`, `Galpão 2`, `R$ 1.552,50` e o rótulo novo. Nenhum era
defeito — são dado do exemplo semeado, nome que a própria checagem digita e um número que
a tela calcula. O que mudou é que agora estão **ditos**, com motivo, em vez de invisíveis.

**A régua que fica, e ela é maior que este extrator:** toda guarda tem um detector dentro,
e detector que não sabe ler uma forma **não reporta nada** para ela — o que é
indistinguível de "não há nada". Este projeto já exige positivo e negativo para todo guard;
o que faltava era a variação: **quando duas guardas discordam, uma delas está quebrada, e a
discussão entre elas é o relatório de defeito mais barato que se vai receber.** Não obedeça
à que está falando; descubra qual das duas mente.

**E o navegador achou o que nenhum teste de módulo acharia**, na mesma rodada: com a câmara
fria na lista das nossas salas E na lista de destinos, *"Câmara 1"* virou o rótulo de dois
botões na mesma tela. O `e2e` clicou no primeiro e escolheu a origem quando queria o
destino — e quem usa TalkBack ouviria exatamente isso: dois botões com o mesmo nome, sem
dizer o que cada um decide. O rótulo passou a carregar a pergunta que responde. **A
ambiguidade de acessibilidade e a ambiguidade de seletor são o mesmo defeito**, e é por
isso que o navegador a encontra: ele escolhe alvo do mesmo jeito que um leitor de tela.

## Recorte feito consulta a consulta deixa a TELA incoerente

9 de setembro, achado ao conferir se uma linha do plano ainda valia — não construindo.

Em 8 de setembro dez consultas ganharam escopo de unidade, uma a uma, e cada uma foi
conferida contra os chamadores dela. O trabalho estava certo e o resultado, não: num
bloco só de `app/(tabs)/index.tsx`, `runningOut`, `stockAgainstOrders` e `recentRuns`
pediam `{ unidade }` e as vizinhas do mesmo `Promise.all` — `productionOn`,
`shipmentsOn`, `productionBetween`, `openProductionRuns` — não pediam nada.

Com duas unidades isso é **a manchete da capa contando duas cidades e o conselho embaixo
dela contando uma**, lado a lado, sem ninguém dizer que a régua mudou no meio. Nenhum
número está errado sozinho; o que está errado é a tela.

**A unidade de conferência não é a consulta: é a tela.** Uma consulta se conserta
olhando os chamadores dela; uma tela se conserta olhando as IRMÃS no mesmo carregamento.
Isso virou guarda (`granularidadeMisturada`), com a lista de consultas que aceitam escopo
**derivada de `repository.ts`** — a décima primeira entra sozinha no dia em que nascer.

**E a medição achou o que a prosa não achava:** uma varredura pelas funções que somam
`movements` sem recorte devolveu catorze, contra as "seis" que o plano afirmava. Doze
eram legítimas — as médias de custo por decisão escrita, e as que agrupam POR lugar,
onde o recorte seria redundante. Duas eram o defeito. **Número em documento é cópia, e
cópia envelhece**; a varredura custou dez segundos.

**A armadilha que quase entrou junto, e ela é a melhor lição desta rodada:**
`shipmentsOn` seleciona a perna POSITIVA da transferência — a que chega, e ela está na
LOJA. Recortar `m.location_id` por unidade, como em todas as irmãs, pediria *"cargas cujo
destino é a nossa unidade"*, que é o conjunto vazio: a capa de Marília mostraria zero
entregas no dia em que ela entregou trinta. O recorte certo é
`m.counterpart_location_id`, que `moveBetween` grava nas duas pernas justamente para
esta pergunta. **Copiar a forma da consulta irmã é o reflexo, e aqui ele daria tela vazia
com teste verde** — nenhum teste afirma "a capa mostra alguma entrega".

E duas chamadas ficaram na empresa **de propósito**, com a razão escrita ao lado:
`ordersCoveredToday` (uma loja pode ser servida por qualquer unidade — recortar
esconderia a carga da outra cidade e mandaria carregar de novo) e a busca por id dentro
de `closeProductionRun`. Fronteira dita em voz alta continua sendo fronteira, e a regra
desta casa é fechar o buraco ou corrigir a promessa; aqui a promessa é que elas são da
empresa, e é verdade.

## Três detectores tropeçaram na mesma pedra em dois dias: comentário não é código

8 e 9 de setembro. A guarda do vocabulário acusou o docblock que a explicava. A do
seletor acusou um comentário de JSX cujas linhas seguintes começam em texto puro. A da
granularidade acusou um docblock que citava `productionOn()` e `shipmentsOn()` com as
duas já recortadas dez linhas abaixo.

Nas três o sintoma foi o pior possível: **a guarda reprovou quem obedeceu.** Guarda que
grita no lugar errado não é rigor — é a que se desliga, e uma guarda desligada protege
menos que nenhuma, porque ainda parece que protege.

A régua que sai é chata e é curta: **todo detector que varre FONTE tira a prosa antes de
contar.** Comentário existe para explicar por que a palavra saiu, e uma régua que não
distingue os dois transforma a explicação em defeito. Está escrito nas três; a próxima
que nascer já começa com o negativo da prosa entre os testes.

## O aparelho não sabia o que o servidor recusaria — e uma recusa por permissão trava a fila para sempre

9 de setembro, procurado e não encontrado por acaso: a ORDEM do plano estava fechada em
tudo que não espera fábrica ou decisão do dono, então o que sobrava era caçar defeito no
filão que já tinha pagado duas vezes no mesmo dia — *o que o aparelho grava contra o que
o servidor aceitaria*.

**Nenhuma das sete escritas de `repository.ts` conferia capacidade.** E o botão de
desfazer do extrato não tinha portão nenhum — nem na tela, nem na camada de dados.

A soma disso com duas coisas que já existiam é o defeito:

1. O SQLite **não tem política, não tem papel e não tem capacidade**. Ele aceita
   qualquer linha, de qualquer um.
2. `drain` **para na primeira linha recusada**, e o comentário ao lado diz por quê:
   *"continuing would send rows whose parents the server does not have, and turn one
   rejection into many"*. Está certo — para uma lacuna de DEPENDÊNCIA, que a próxima
   tentativa resolve.

**Uma recusa por PERMISSÃO nenhuma tentativa resolve.** A linha fica pendente para
sempre, e tudo o que a fábrica gravar depois fica preso atrás dela. `driver` é
`['dispatch','check_receipt','record_loss']` — sem `adjust_stock`, que é o que o servidor
exige para um estorno. Um toque do entregador em "Desfazer" e aquele celular nunca mais
sincronizava, **sem nada na tela**, porque no aparelho a linha entrava normalmente. A
fábrica descobriria semanas depois.

O conserto tem três peças e a terceira é a que impede a tabela de envelhecer:

- `QUEM_ESCREVE` no domínio: qual capacidade cada espécie pede.
- `podeGravar` nas sete escritas, ANTES de a linha nascer — a mesma forma da fundação de
  permissão desta casa, virada para a escrita.
- Uma guarda que **lê o `case kind` da política na migração** e compara. Duas fontes, e a
  que manda não passou pela minha mão.

**E o leitor da política parou dentro da palavra `venda`.** `indexOf('end')` casou com o
miolo de *"v-end-a"*, num comentário que explica a venda: ele leu quatro espécies, deu as
outras seis como ausentes do servidor, e **acusou a tabela certa** de divergir de uma
política que não tinha terminado de ler. Duas linhas consertam — tirar a prosa antes, e
procurar `end` como PALAVRA — e as duas são a mesma lição da régua irmã escrita hoje de
manhã. É o quarto detector desta casa a tropeçar em prosa em dois dias, e o primeiro a
tropeçar dentro de uma palavra.

**A régua que fica:** um portão que só existe do outro lado da rede não é um portão para
quem escreve offline — é um adiamento, e o preço dele não é a linha recusada: é a fila.
Onde o servidor recusa por permissão, o aparelho tem de recusar antes, com a mesma
tabela, **derivada dele**.

E a metade que impede o conserto de virar parede está no teste junto: o que o entregador
NÃO alcança é recusado, e o que ele alcança continua passando. Portão que recusa tudo
protege a fila e mata o aplicativo.

## A guarda que não achou nada — e por que ela entra assim mesmo

9 de setembro, seguindo o mesmo filão que já tinha pago três vezes na noite: *o que o
aparelho grava contra o que o servidor aceitaria*. Depois de `movements`, a pergunta
natural é o resto — a fila empurra **22 tabelas**.

A varredura: três delas não têm política de UPDATE no servidor (`movements`,
`sale_price_history`, `erase_requests`), e as três são append-only **de propósito**. A
fila sobe com `on conflict do update`, então reenviar uma linha dessas seria recusado por
política — e `drain` para na primeira recusa. O aparelho já sabe: `APENAS_INSERE` manda
`ignoreDuplicates` para exatamente elas.

**As duas listas concordam. Não havia defeito.** E é justamente por isso que vale
registrar: *"não achei nada"* é resposta válida e precisa ser dita, senão a próxima
varredura inventa um achado para não voltar de mãos vazias.

O que faltava não era o conserto — era a coisa que impede o próximo. `APENAS_INSERE` é
escrita à mão, e uma tabela append-only nova entra no servidor sem ninguém lembrar dela
aqui. O sintoma apareceria em produção, meses depois, com a causa a quatro arquivos de
distância. Agora uma guarda **deriva das migrações** quais tabelas o servidor deixa
reescrever e compara — e ela respeita `drop policy`, porque a `0008` e a `0047` derrubam
e recriam a política de `movements`: um leitor que só somasse `create` daria por viva uma
forma revogada.

**A régua que fica:** guarda não se escreve só quando há defeito. Onde duas listas
precisam concordar e uma delas é escrita à mão, a guarda é o preço de a concordância não
depender de memória — e o momento de escrevê-la é aquele em que se acabou de conferir
que elas concordam, porque é quando se sabe qual é a comparação certa.

E a exceção ficou nomeada em vez de invisível: `readings` está na lista conservadora e o
servidor deixaria corrigir. É decisão — uma medida é um fato num instante, e reescrever
uma leitura seria mudar o que o termômetro disse às três da manhã. A guarda exige a razão
escrita para aceitar a diferença.

## `Object.entries` sobre uma FUNÇÃO devolve vazio — e o teste passa de graça

9 de setembro, cometido e pego dez minutos depois, na guarda que eu estava escrevendo
justamente para não deixar nada passar de graça.

`CROSSINGS_FOR_TESTS_ONLY` é `() => CROSSINGS`. Eu escrevi
`Object.entries(CROSSINGS_FOR_TESTS_ONLY)` — sem chamar. Função é objeto em JavaScript,
`Object.entries` devolve as propriedades próprias enumeráveis dela, que são **nenhuma**,
o laço não rodou uma vez, e o teste passou verde na primeira execução.

**O typecheck aceita**, e não é bug dele: `Object.entries` sobre uma função é legal. E o
verde é o pior sintoma possível, porque ele parece a resposta que se queria — eu tinha
acabado de escrever uma guarda nova e ela "já passava".

O que pegou foi o reflexo que este arquivo documenta três vezes: **varredura vazia não é
comparação, é silêncio.** Toda régua desta casa carrega uma asserção de presença ao lado
da de ausência — *"a varredura veio vazia, a comparação seria de graça"* — e foi ela que
faltou por dez minutos.

Duas coisas ficaram no lugar: o laço conta quantas colunas conferiu e exige mais de
vinte, e a guarda foi provada **por mordida** (afrouxando `movements.quantity_base_units`
no aparelho, ela acusa com a frase certa). Guarda nova sem mordida é guarda que ninguém
sabe se morde.

**A régua que fica, e ela é mais estreita e mais útil que "teste o teste":** quando a
fonte de uma varredura é exportada como função — e várias são, para não congelar o
objeto —, o erro de esquecer o `()` não aparece em lugar nenhum. Nem no tipo, nem no
resultado, nem na cor do teste. **Só a contagem denuncia.**

## Guarda que confere o GESTO passa; o que protege é conferir o EFEITO

9 de setembro, achado pelo `mutate` — e é o primeiro sobrevivente de verdade em quatro
rodadas, depois de doze âncoras cegas que não provavam nada.

Quando o escopo do consumo virou configuração, escrevi uma guarda para o acordo entre a
tela e a escrita. Como a resposta passou a ser dado, ela deixou de comparar a PALAVRA dos
dois lados e passou a exigir a FONTE comum: *"a tela chama `consumoDaProducao()`?"*.

O defeito plantado deixou a chamada no lugar e trocou o **argumento** de `listItems` por
`undefined`. A tela voltava a ler a empresa inteira — botão liberado sobre estoque que a
escrita recusa, que é exatamente o defeito de ontem — com a pergunta feita e a resposta
jogada fora. **569 asserções continuaram verdes**, e a guarda escrita para isso também.

É a irmã da que conferia a ARIDADE de `listItems` em vez do escopo, duas semanas de
código depois e com a mesma forma: **medi o gesto que o conserto produziu, não a
propriedade que ele tinha de garantir.** Chamar a régua é o gesto; o escopo chegar na
consulta é o efeito.

**A régua que fica, e ela vale para toda guarda de acordo entre duas peças:** depois de
escrever a guarda, pergunte *"qual é a menor mudança que a mantém verde e quebra o
acordo?"*. Se ela existe, a guarda está no gesto. Aqui a menor mudança era uma palavra —
`undefined` — e o `mutate` a encontrou porque é literalmente o que ele faz.

E o corolário operacional: **guarda nova entra com uma mutação junto.** As duas guardas
que nasceram hoje sem mutação passaram a ter uma; a que nasceu com, foi a única que não
precisou deste insight.

## Promessa boa que ninguém cobra é buraco — e a régua que a mede pode ser a errada

9 de setembro, caçando com a pergunta que tinha rendido três vezes na noite: *alguma
guarda promete mais do que confere?*

`src/law.test.ts` guarda a Lei 3 (*nenhum número aparece sozinho*), e o docblock dela diz,
com estas palavras: *"Dez números, dez respostas. **Na ordem em que aparecem no
arquivo**"*. O código conferia outra coisa: que a expressão declarada casasse **em
qualquer lugar** do arquivo. Numa tela de dez números, nove poderiam ficar nus com a
suíte verde — bastava a comparação do primeiro existir.

**Antes de consertar, medi. E a primeira medição estava errada — a minha.** O script
contou `type.figure` dentro de comentários e acusou uma comparação fora de posição no
`Capa.tsx`. Fui olhar: as duas ocorrências eram de um docblock que explica por que aquele
número usa `type.figure`. **A guarda já limpava a prosa; quem não limpava era eu.** Quase
reportei como defeito do código o defeito do meu próprio detector — a régua que este
arquivo manda rodar contra um caso verdadeiro e um falso, e que eu não rodei.

Refeita com a mesma limpeza da guarda: **as 21 comparações declaradas estão, hoje, na
vizinhança do número delas.** Zero fora de posição. Então não havia defeito — havia uma
promessa verdadeira que nada sustentava, e a regra desta casa não dá terceira saída: *se
a promessa é boa, feche o buraco; se não é, corrija a promessa.*

A vizinhança vai até o meio do caminho para o número vizinho, dos dois lados. Não é
número mágico de linhas: é o único corte que não precisa de calibração, e ele degenera no
arquivo inteiro quando há um número só — o comportamento antigo, preservado para as onze
telas de um número.

Provada por mordida, e a mordida é o ponto: **trocando a ORDEM de duas declarações** — as
duas continuam existindo no arquivo, e a guarda antiga aceitava — a nova acusa. Era
exatamente esse o buraco.

**A régua que fica:** a pergunta *"esta guarda promete mais do que confere?"* achou quatro
casos em dois dias (aridade em vez de escopo, gesto em vez de efeito, presença em vez de
obrigatoriedade, e agora arquivo em vez de posição). Ela merece ser a primeira pergunta ao
ler qualquer guarda deste repositório — e a segunda é a que quase me pegou: **a régua que
você usou para medir a guarda também é uma régua.**

---

## 9 de setembro — a crase é delimitador E pontuação, e isso cega réguas

**O que apareceu:** a guarda que impede o aplicativo de nomear equipamento lia `'aspas
simples'` e `"aspas duplas"`, e não a crase. O texto que o assistente FALA é montado em
template literal, então ela contava **zero** onde havia **três** — e a palavra que este
projeto tirou de treze lugares em três idiomas continuava saindo da boca do aplicativo,
na frase que a pessoa lê.

**Por que importa:** no mesmo dia a crase me quebrou o código **três vezes**, sempre do
mesmo jeito — um comentário SQL dentro de um template literal citando `` `um nome` `` em
crase fecha o literal e o TypeScript acusa `',' expected` numa linha que parece SQL. As
três quebraram na hora e eu consertei em segundos. A da guarda **não quebrou nada**: ela
ficou verde afirmando que estava tudo limpo.

**A régua que fica:** neste repositório a crase tem dois papéis — delimitar código e
citar um nome dentro de prosa. Todo detector que lê "texto entre aspas" precisa das
**três** aspas, e todo comentário dentro de template literal precisa não ter nenhuma.
O primeiro caso falha em silêncio, que é o caro.

**O que mudou:** `src/dictionary.test.ts` passou a ler a crase (e achou as três frases
na hora); as três frases do assistente foram reescritas.

---

## 9 de setembro — quando uma conta vira a ÚNICA autora, o desempate dela passa a mandar

**O que apareceu:** `recomputeItemCost` replaya o razão em ordem, e o último desempate
era `m.id` — um uuid. Enquanto ela só rodava no ESTORNO isso quase nunca aparecia. No
mesmo dia ela virou a única autora de `item_costs` (havia três escritores dando números
diferentes para o mesmo razão), e o desempate passou a decidir o `last_rate` de **toda
compra**. Um teste de dinheiro começou a falhar **uma vez a cada tantas**.

**Por que importa:** o conserto estava certo — três autores para um dado é como três
verdades nascem. O que ele mudou sem ninguém notar foi o **peso** de uma linha que já
estava lá: um desempate aceitável num caminho raro virou load-bearing num caminho
constante. E o sintoma foi o mais fácil de descartar que existe: um teste que passa em
cinco execuções e falha na sexta parece flake, e "flake" não é causa raiz.

**A régua que fica:** ao unificar escritores, pergunte o que a peça sobrevivente decidia
por acaso. Ordem, empate, arredondamento e ordenação são as quatro que costumam estar
ali. E: **um teste de dinheiro que oscila nunca é flake até se provar que é.**

**O que mudou:** o replay desempata por `rowid` (a ordem em que as linhas entraram no
aparelho, que é o que "a última" quer dizer), com uma guarda que roda vinte sorteios.

---

## 9 de setembro — a refutação adversarial paga no CONSERTO, não só no achado

**O que apareceu:** uma auditoria de 24 fatias, cada uma com um adversário próprio. O
adversário não só derrubou 18 achados de 145 — ele **corrigiu o conserto** de um que
sobreviveu: o auditor propôs `AND NAO_ESTORNADO` para tirar o estorno da média de
consumo, e o refutador mediu e mostrou que aquilo **não conserta** o caso principal. A
cláusula tira o movimento ORIGINAL, que é positivo e que a soma de saída nem olha; quem
entra na soma é a perna que DESFAZ, que nasce negativa e para a qual nada aponta. Só o
par zera as duas pontas.

**Por que importa:** a régua desta casa era "todo achado passa por verificação
adversarial antes de virar afirmação". O achado estava certo. Aplicar o conserto que
veio com ele teria deixado o defeito de pé com a suíte verde — e com um commit dizendo
que estava resolvido, que é pior que não ter mexido.

**A régua que fica:** o adversário mede o CONSERTO também, não só o defeito. Um conserto
proposto é uma afirmação sobre o mundo como qualquer outra.

---

## 9 de setembro — duas fontes que concordam por acaso não medem nada, e o acaso é fácil

**O que apareceu:** três guardas novas escritas nesta sessão não morderam quando eu tirei
o conserto para testá-las. As três pelo mesmo motivo, e nenhum era o motivo que este
arquivo já registra:

- a contagem falada na câmara fria: o dublê tinha **40.000 no lugar e 40.000 no total do
  item**, então comparar pelo lugar ou pelo total dava o mesmo número;
- "quanto saiu ontem": no dublê **nada saía hoje**, então a resposta errada ("Nada saiu
  da produção hoje") era indistinguível da certa;
- a ordenação do custo: o defeito é probabilístico, e **uma volta não é medida**.

**Por que importa:** o arquivo já dizia *"a segunda fonte tem de ser INDEPENDENTE da
primeira"*, e eu li isso como uma regra sobre a ARITMÉTICA da asserção. Não é só isso: é
sobre o MUNDO do teste. Um cenário em que as duas leituras coincidem é um cenário que
não distingue nada, por mais certa que a asserção esteja.

**A régua que fica:** depois de escrever a guarda, **remova o conserto e veja-a ficar
vermelha**. Isso pegou três de três nesta sessão — e cada uma tinha passado no meu olho.
Quando não morder, a primeira hipótese não é "o conserto não era necessário": é que o
cenário não separa os dois mundos.

---

## 9 de setembro — a ferramenta que prova tela não alcançava a tela

**O que apareceu:** `node scripts/aparelho.mjs fotos <rota>` é a régua que este projeto
inteiro cita como a prova de layout — o `CLAUDE.md` diz, desde 5 de setembro, que ela
"tira a mesma tela em cinco larguras". Ao usá-la pela primeira vez numa tela que não é a
capa, as cinco fotos saíram da **capa**. As cinco. O comando saiu zero e gravou cinco
PNGs válidos, cada um com variação de cor suficiente para passar na checagem de "foto
morta" que o próprio script faz.

A causa é banal e é a razão de ninguém ver: trocar `wm size`/`wm density` é mudança de
configuração, o Android recria a Activity, e o app refaz a partida — na tela inicial. O
argumento chamado `<rota>` nunca foi rota; era só o nome do arquivo.

**Por que importa:** não é um script com defeito, é uma **fundação apoiada em ar**. A
barra de verificação deste projeto foi reescrita em torno da frase "verde não prova tela;
o que prova é a foto do emulador", e a única ferramenta que produz essa prova para telas
profundas produzia cinco cópias de outra tela. Todo julgamento de adaptação feito por ela
fora da capa mediu a capa. É o mesmo defeito de *"uma guarda que compara duas coisas
escritas pela mesma mão"*, um andar acima: aqui o instrumento respondia sempre a mesma
coisa, e a resposta era plausível.

**O que mudou:** o `app.json` já declarava `scheme: norva` e ninguém usava. Agora
`abrir <rota>` navega por ligação profunda, `fotos <nome> <rota>` reabre a rota **depois**
de cada troca de largura, e — porque `am start` responde "ok" para qualquer caminho — o
comando lê o texto da tela com `uiautomator dump` e **recusa** quando as cinco não são a
mesma tela. A régua dessa recusa tem autoteste com caso verdadeiro e caso falso
(`aparelho.mjs autoteste`), que é o que este arquivo exige de toda medida de uma vez. A
linha do `CLAUDE.md` foi corrigida junto: promessa boa, buraco fechado.

> **Este parágrafo estava errado, e o erro durou dois dias — corrigido em 11 de setembro.**
> O autoteste tinha a FORMA que esta casa exige e afirmava o defeito. O último caso dele
> era `[[], true]`: *nenhuma leitura → "as cinco são a mesma tela"*. Com o movimento de
> ambiente ligado, que é o estado normal do aplicativo, as cinco leituras falhavam, o
> `.filter(Boolean)` descartava as vazias, e `[].length <= 1` dava verde — então o buraco
> não estava fechado, estava **carimbado**.
>
> Ter caso verdadeiro e caso falso não basta se o caso falso afirma o comportamento
> errado. A pergunta que faltava não é *"tem os dois casos?"* e sim **"o que este caso diz
> que deve acontecer, e é isso mesmo?"** — e `[[], true]` responde, em uma linha, que não.
>
> Hoje o veredito tem três respostas (`scripts/leitura.mjs`) e quem o exercita é
> `src/leitura.test.ts`, com sete casos, rodando no `npm test`. O verbo `autoteste` foi
> removido: duas fontes para uma verdade é o defeito de sempre, e a que ficou é a que a
> CI roda.

**E a mesma investigação achou o custo escondido do laço.** Trocar `wm size` destrói a
Activity e o Android **não a recria sozinha**: o processo do app fica vivo com zero view
anexada, e nesse estado o `dumpsys gfxinfo` nem imprime a linha `Total frames rendered`
que o script espera. A espera pelo redesenho, que existe justamente para não fotografar
tela em branco, estava esperando um app que ninguém tinha mandado desenhar — oito minutos
por largura, quarenta na volta inteira. Quem acorda a tela é o próprio `am start` da rota,
então a rota passou a vir logo depois da troca de largura, e a espera passou a ser uma só.

**E o instrumento novo trombou com uma exigência do produto, o que vale registrar.** Ler
o texto da tela é `uiautomator dump`, e ele **recusa tela que se mexe**: responde *"could
not get idle state"* e volta vazio. Este aplicativo tem animação em toda tela por decisão
escrita do dono, então a leitura falha de vez em quando — não sempre, porque o dump
costuma pegar uma brecha entre ciclos da cena. O conserto não é desligar animação: é o
laço voltar para o contador de quadros depois de três leituras mudas, e a conferência das
cinco larguras ignorar título vazio em vez de reprovar por ele. Instrumento que exige
imobilidade num produto que exige movimento precisa de um segundo caminho, não de uma
exceção no produto.

**A régua que fica:** ferramenta de prova também é afirmação, e envelhece igual. Antes de
confiar numa medida que você não escreveu hoje, **rode-a onde a resposta é conhecida** —
aqui bastava fotografar duas telas diferentes e comparar. Instrumento que devolve sempre
a mesma resposta é indistinguível de instrumento que funciona, até o dia em que a resposta
importa.

---

## 9 de setembro — o que parecia corte de layout era o dado

**O que apareceu:** a primeira foto do Almoxarifado a 393 dp mostrou duas palavras
cortadas — *"Material de lo"* e *"LojaCen"* — e eu anotei as duas como defeito de largura.
Ampliando a imagem antes de consertar, só uma era: *"Material de lo"* termina exatamente
na borda do rolamento horizontal; *"LojaCen"* termina **bem dentro do cartão**, com
espaço sobrando à direita. Não está cortada. É o nome do lugar, e fui eu que o gravei
assim — `adb shell input text "Loja Centro"` come o espaço e o resto.

**Por que importa:** o conserto que eu ia fazer teria mexido no layout para resolver um
problema de layout que não existia, e o defeito real — um lugar cadastrado com nome
errado no aparelho de teste — seguiria lá, agora com um commit dizendo que estava
resolvido. E o pior: a segunda "prova" teria sido a mesma foto, mostrando o mesmo texto.

**A régua que fica:** antes de chamar palavra cortada de defeito de largura, **ache a
borda do recipiente e veja onde o texto termina**. Se sobra espaço, não é corte: é o
dado. E ampliar a foto custa dois segundos — a mesma foto que produziu a leitura errada
produz a leitura certa, quando alguém olha de perto.

---

## 9 de setembro — a régua de contraste media a cor com que o botão é PINTADO, e o botão desligado não é pintado com nenhuma delas

**O que apareceu:** a foto da tela nova mostrou "Criar ficha" em branco sobre bege claro,
ilegível — um botão que não estava quebrado, estava só **desabilitado**. E a guarda de
contraste deste repositório estava verde, como está desde que foi escrita.

Ela não estava errada: estava medindo outra coisa. `Button.tsx` escolhe a tinta do rótulo
**medindo-a** contra o preenchimento (`tintaSobre`), o que é a doutrina certa e está
escrita no docblock. Só que, três linhas abaixo, ele desbotava o botão INTEIRO com
`opacity: 0.45` — e opacidade compõe preenchimento e rótulo sobre a página ao mesmo
tempo. Os dois caminham juntos na direção da cor de fundo, o contraste entre eles desaba,
e a medida feita contra a cor cheia passa a descrever uma cor que **não está na tela**.

**Por que importa:** é a terceira vez que este repositório registra a mesma família — a
guarda mede o vizinho da propriedade. Antes foram as tintas de texto medidas contra os
fundos de página enquanto o botão escrevia escuro sobre marrom; agora é o botão medido
cheio enquanto a tela mostra ele desbotado. A assinatura é sempre a mesma: **a régua e o
defeito estão a um passo um do outro, e o passo é invisível de dentro da régua.**

E o custo é maior do que "um botão feio": botão desabilitado sem rótulo legível não diz o
que falta. A Lei 5 desta casa manda impedir em vez de reclamar — mas impedir calado, sem
a pessoa conseguir ler o que o botão faria, é impedir sem dizer o que resolve.

**O que mudou:** `mistura(frente, fundo, alfa)` entrou na régua de contraste, o botão
desbota só o PREENCHIMENTO e mede a tinta contra o que sobrou, e a guarda passou a medir a
composição que a tela mostra. Ela traz o caso falso junto, e não como enfeite: a mesma
asserção exige que o jeito ANTIGO **reprove** na régua — sem isso ela não separa o mundo
consertado do quebrado. E como essa guarda mede aritmética e não componente, uma segunda,
em `layers.test.ts`, recusa `opacity: disabled` em qualquer fonte de `app/` e `src/` e
exige que o `Button` continue medindo — porque régua e conserto escritos pela mesma mão
concordam sozinhos.

**A régua que fica:** quando um componente **decide uma cor por medida**, procure o que
mexe nessa cor DEPOIS da medida. Opacidade, sombra, sobreposição e mistura de tema são
todos passos que acontecem entre a conta e o olho, e nenhum deles aparece no arquivo onde
a conta está escrita.

---

## 9 de setembro — desenho não tem guarda, e o caderno estava aberto no meio

**O que apareceu:** o dono olhou a cena de Receitas do Papel e disse *"esse caderno aí está
bagunçado"*. Estava, e não por um defeito: por quatro, todos geométricos e todos invisíveis
para tudo o que este repositório roda.

- A página direita era empurrada por `translateX` de até sete unidades. No meio do ciclo o
  livro **se partia em dois** — lombada de um lado, folha do outro.
- A curva de baixo da página direita fechava em (82,**68**) enquanto a esquerda e a lombada
  terminavam em (82,**64**): um gancho de quatro unidades pendurado sob o centro.
- A terceira linha da pauta, em y=58, **cruzava** a borda de baixo da própria página.
- E a pauta existia só na página da direita, então o caderno lia como desenho pela metade
  — numa tela cujo assunto é justamente o que entra de um lado e o modo de fazer do outro.

**Por que importa:** `typecheck`, 608 testes, lint e portão passaram por cima dos quatro
sem tocar em nenhum. **Geometria não tem guarda neste projeto e não vai ter**: a régua de
um desenho é o olho. O que agrava é que o arquivo já tinha o idioma certo — o par
`translateX(a) · scale · translateX(-a)`, que fixa o centro da transformação numa
coordenada — usado em **quatro** outros lugares. A cena do livro era a única com
`translateX` cru, e ninguém comparou.

**O que mudou:** as duas páginas passaram a encostar exatamente na lombada, a folha ERGUE
por encurtamento em vez de deslizar (uma página que se levanta fica mais estreita vista de
cima, e continua presa), a pauta entrou nas duas páginas longe das bordas, e o desenho foi
conferido no aparelho, na pele onde ele vive.

**A régua que fica:** desenho novo se **renderiza e se olha** antes de entrar — e isso não
custa um emulador. As mesmas `d=` do componente, jogadas num SVG e rasterizadas
(`cairosvg`), mostraram os quatro defeitos numa passada, em segundos, com o antes e o
depois lado a lado. Uma foto do aparelho continua sendo a prova final, porque é ela que
inclui pele, fonte e escala; o desenho vetorial é o que evita gastar uma compilação para
descobrir que duas curvas não se encontram.

---

## 9 de setembro — inventei uma regra que o aplicativo já respondia, e um guarda me devolveu o argumento

**O que apareceu:** o item A da auditoria diz que contar picolé pronto não tem caminho de
toque, e termina assim: *"a porta certa não é uma quarta aba no almoxarifado — o assunto
não é almoxarifado. É a lista de produtos."* Li isso como uma frase sobre COR e construí
em cima: a espécie do item passou a viajar na rota, o casco da tela passou a se pintar de
laranja para produto, a sobrancelha e a cena mudaram junto, seis chaves novas de
dicionário nos três idiomas, e um guarda próprio para nenhum chamador esquecer o
parâmetro. Cerca de cento e vinte linhas.

`src/theme/assinatura.test.ts` reprovou, e o texto do erro é o argumento inteiro: *"o
desenho carrega o tom do ASSUNTO, não o da tela em que mora"*. O `AREA_DO_GLIFO` lista
`GlyphStick` — o picolé — em **mint**, junto com o saco e o balde, porque a tela de um
item é a página de ESTOQUE dele: saldo, contagem, perda. Contar picolé é estoque, venha a
pessoa de onde vier. O `docs/linguagem.md` já dizia; eu não abri.

**Por que importa:** a frase do plano era sobre a PORTA — de onde se chega — e eu a
apliquei ao DESTINO. É a mesma família do "vizinho da propriedade" que este arquivo já
registra três vezes em guardas que medem a coisa ao lado da que deviam medir; a novidade
é que desta vez o vizinho estava na minha LEITURA, não na régua. Prosa de plano fala de
uma coisa, e a coisa ao lado dela parece incluída.

E o custo teve número: cento e vinte linhas construídas, testadas e desfeitas, incluindo
seis chaves de dicionário que teriam ficado sem leitor — a doença que o portão P1 deste
projeto existe para pegar.

**O que mudou:** ficou só o que era defeito de verdade e vem do dado — a lista de produtos
abre o ITEM (com contagem e perda), a ficha fica a um toque de dentro, e o cartão "Como
você compra" dá lugar a "Como é feito" quando o produto é feito aqui, porque picolé da
própria fábrica não tem fornecedor nem saco de 25 kg. A cor não mudou. Um guarda novo,
derivado da união `ItemKind` e das abas do almoxarifado — duas fontes que não passaram
pela minha mão nesta edição —, fica vermelho no dia em que nascer uma sexta espécie sem
porta.

**A régua que fica:** antes de construir a consequência VISUAL de uma frase do plano,
procure se o aplicativo já respondeu essa pergunta noutro lugar — `docs/linguagem.md`, o
mapa de glifos, os guardas de assinatura. E o corolário, que é o mais barato de todos:
**rode os guardas antes de escrever cento e vinte linhas, não depois.** O que me custou a
rodada não foi o erro; foi a ordem em que descobri o erro.

---

## 9 de setembro — quem engole exceção troca um defeito barulhento por um silencioso, e precisa gravar o motivo

**O que apareceu:** o executor do Reset do servidor percorria os pedidos vencidos de todas
as empresas numa transação só. Uma exceção em qualquer um abortava a função inteira —
nenhuma empresa atendida, nenhum pedido marcado, e o agendador tentando de novo na noite
seguinte com o mesmo pedido na frente da fila. É a mesma família da fila do aparelho, que
este repositório já registrou por escrito: **recusa que nenhuma tentativa resolve tem de
sair da frente**.

O conserto é dar a cada pedido a própria subtransação. E foi ao escrevê-lo que a segunda
metade apareceu, na primeira execução: eu tinha declarado as espécies de item como
`text[]` e `items.kind` é um enum, então toda volta levantava *"operator does not exist:
item_kind = text"* — e o bloco de tratamento **engolia a exceção**. O Reset simplesmente
não acontecia. Sem `last_error` gravado, o sintoma seria "o comando devolveu 0" e mais
nada, todas as noites, para sempre.

**Por que importa:** isolar falhas é certo e tem um preço que não se paga sozinho. Antes,
o defeito era ruidoso e caro (travava o banco inteiro); depois, ele é barato e **mudo** —
e mudo é pior de achar. As duas colunas que gravam quando e por quê não são enfeite de
observabilidade: são o que torna o `exception when others` aceitável. Um `catch` sem
registro não conserta um defeito, troca a espécie dele.

**O que mudou:** a `0049` grava `failed_at` e `last_error`, a checagem 25 do `db:verify`
imprime o motivo quando reprova — em vez de dizer só "não executou" e mandar quem lê abrir
o banco —, e a checagem 26 prova o isolamento com a cena montada para falhar. Ficou também
o achado que sai daqui: **o aplicativo não lê o estado do pedido de Reset** (só escreve),
então o rastro existe e ninguém o vê. Entrou na fila com medida, atrás do caminho de
leitura do servidor, que ainda não existe.

**A régua que fica:** ao trocar "a volta inteira falha" por "este item falha", pergunte
quem vai ficar sabendo. Se a resposta for "quem abrir o banco", o conserto está pela
metade — e a metade que falta é justamente a que se descobre tarde.

---

## 9 de setembro — crase é substituição de comando dentro de heredoc, e a prosa não sabe disso

**O que apareceu:** escrevi um comentário SQL dentro de um heredoc não citado do
`verify-migrations.sh` citando uma coluna entre crases, como este projeto escreve prosa em
toda parte. O shell **executou** o conteúdo: `scripts/verify-migrations.sh: line 1615:
recipe_lines.item_id: command not found`. A checagem passou mesmo assim — a substituição
devolveu vazio e o comentário SQL ficou com um buraco no meio —, então o único sinal foi
uma linha de erro no meio de uma saída verde.

**Por que importa:** este repositório já tem a cicatriz da crase escrita, de outro
ângulo: *"crase é ao mesmo tempo delimitador de literal e pontuação de prosa"*, e ela já
quebrou o TypeScript três vezes e cegou uma guarda. Aqui é a terceira sintaxe onde a mesma
tecla muda de significado — e nesta ela não quebra a compilação, ela **roda um comando**.
Num heredoc que já interpola `${VAR}` de propósito, não há como desligar uma coisa sem
desligar a outra.

**O que mudou:** a crase saiu, com o motivo escrito na linha de baixo para ninguém a
trazer de volta, e uma varredura de todos os heredocs não citados do script confirmou que
era a única.

**A régua que fica:** dentro de heredoc não citado, prosa não usa crase — e quando uma
saída verde traz uma linha de erro no meio, **a linha de erro é o achado**, não ruído.
Verde é o veredito do último comando, não do caminho até ele.

---

## 9 de setembro — recortar um lado de uma comparação deixa o outro lado mentindo

**O que apareceu:** em 8 de setembro o saldo passou a ser da UNIDADE — `stockAgainstOrders`
ganhou o parâmetro obrigatório, o teste *"o freezer de uma unidade não promete para a
outra"* entrou junto, e o defeito foi dado como fechado. Ele não estava. A mesma função
compara duas coisas — **quanto tem** e **quanto foi pedido** — e só a primeira foi
recortada. O pedido continuou sendo o da empresa inteira, então com duas fábricas as duas
leem *"faltam 300"* para o mesmo pedido, as duas produzem, e a fábrica faz o dobro do que
alguém pediu.

**Por que importa:** o conserto de 8 de setembro estava certo e era metade. E a metade que
faltou é invisível pelo caminho por onde a primeira foi achada: quem procura *"esta
consulta soma o lugar errado?"* olha a subconsulta do saldo, acha, conserta, e o `LEFT
JOIN` do pedido — trinta linhas abaixo, na mesma função — não parece parte da pergunta. O
teste que entrou junto também só olhou o saldo, então a suíte ficou verde afirmando a
metade certa.

**A régua que fica:** quando um número é a comparação de dois outros, **recortar um dos
dois obriga a perguntar do outro na mesma frase**. Não é revisão de vizinhança: é que uma
comparação com os lados em escopos diferentes é sempre falsa, e o resultado tem cara de
número bom.

**E a armadilha do conserto, que quase entrou:** `locations` já tinha
`parent_location_id`, e reusá-lo para dizer quem atende a loja teria compilado no mesmo
minuto. Seria um defeito calado — `noEscopo(coluna, { unidade })` soma o lugar **e os
filhos dele**, então uma loja "dentro" da fábrica jogaria mil picolés de prateleira de
loja no saldo dela, e o número que decide produção subiria sem nada acusar. São duas
relações — *"fica dentro de"* e *"é atendida por"* — que **desenham igual num diagrama e
somam diferente numa consulta**. Duas colunas, com o porquê escrito nas duas pontas, e o
domínio já tinha a régua pronta (`UNIT_ROOM_KINDS` diz, desde 8 de setembro, que loja e
cliente não ficam dentro de unidade nenhuma).

**O que mudou:** `served_by_location_id` no aparelho (V27) e no servidor (`0050`), com
backfill dos dois lados para o padrão ser invisível a quem tem uma fábrica só; a demanda
recortada pela loja que a unidade atende, com a régua escrita uma vez porque a pergunta
aparece duas na mesma consulta; a coluna atravessando a fila; a tela perguntando **só**
onde há mais de uma unidade; uma guarda irmã da que cobra a unidade da sala; e a garantia
27 contra Postgres, que é onde a chave composta — a que impede uma loja de ser atendida
pela unidade de um concorrente — existe de verdade.

---

## 9 de setembro — a escada não desce, e a restauração devolve a coluna vazia

**O que apareceu:** `restaurar` não copia esquema. Ele apaga as linhas de agora e repõe
as da cópia dentro do esquema ATUAL, coluna por coluna, usando só as que existem nos dois
lados. `PRAGMA user_version` fica onde estava, e está certo — as tabelas já são as de
hoje. O que fica para trás é o **dado**: a coluna que a cópia não tinha entra com o padrão
dela, e o `UPDATE` que a teria preenchido rodou uma vez, meses atrás.

Uma cópia feita antes da V25 volta com toda câmara fria **sem pai**. Sala sem pai sai do
saldo da unidade, então o pedido deixa de contar o que está no freezer. O saldo apenas vem
menor, logo depois de a tela dizer *"restaurado com sucesso"*.

**Por que importa:** é a família de defeito mais cara deste projeto — o número que encolhe
sem nada acusar — e ela chega pela porta que existe justamente para salvar o dado. E o
diagnóstico da auditoria estava meio errado, o que vale registrar: ela dizia *"nunca toca
`PRAGMA user_version`"*, sugerindo que a escada deveria subir de novo. Não deveria; o
esquema já está no topo. O que falta não é migrar, é **reparar**.

**E "reparo" não é o mesmo que "backfill", que é a metade que quase me pegou.** Um
backfill roda uma vez, logo depois de a coluna nascer, quando ela está vazia por
construção. Um reparo roda a qualquer momento e tem de reconhecer o que já está
preenchido. Três dos quatro já eram condicionais e viraram constante única, usada pela
migração e pela lista — cópia envelheceria em silêncio. O quarto não: a V18 escreveu
`SET unit_packaging_rate = unit_packaging_cents` sem condição, e reexecutar isso hoje
devolveria toda taxa editada desde então ao inteiro velho. Reusá-la teria transformado o
conserto num destruidor de dado, com o teste da restauração verde.

**E a guarda que escrevi primeiro media a forma, não a regra.** Ela contava `^UPDATE ` no
arquivo e passou a contar UM depois de eu extrair três para constantes — a arrumação que
eu tinha acabado de fazer mudou a resposta da régua. Régua que muda de resposta com a
arrumação do arquivo não é régua. A segunda versão lê o CORPO de cada migração e cobra
que o `UPDATE` seja interpolado de uma constante ou declarado como exceção com o motivo.

**A régua que fica:** quando um caminho repõe dado dentro de um esquema mais novo,
pergunte o que foi PREENCHIDO por instrução e não por linha. Coluna vazia com padrão
válido é a forma mais silenciosa de perda: ela não quebra referência, não levanta exceção,
e passa por toda checagem que olha a estrutura em vez do conteúdo.

---

## 9 de setembro — a mesma seta enganou a mesma leitura pela segunda vez

**O que apareceu:** escrevi uma guarda para os alvos de toque abaixo do piso de 48 dp. Ela
lia a abertura de cada `<Pressable` com `texto.indexOf('>', inicio)` — e o primeiro `>`
depois de `<Pressable` não é o fim da etiqueta: é o da **seta** de `onPress={() => ...}`.
O corpo lido parava antes do `style`, então nenhum controle era acusado. A guarda ficou
verde sobre exatamente o que existia para pegar.

Só apareceu porque tirei o conserto de uma tela para vê-la ficar vermelha, e ela **não
ficou**. O caso falso que eu tinha escrito ao lado passava: os fixtures fabricados diziam
`onPress={f}`, sem seta, então não reproduziam o defeito que existiam para provar.

**Por que importa:** este repositório já registra esta cicatriz, com outro sujeito — *"34
alvos de toque sem rótulo (um `=>` terminando a expressão regular; a resposta real era
zero)"*. É a mesma seta, na mesma família de leitura, com três dias de diferença. A regra
escrita não impediu, porque ela estava guardada como uma anedota sobre um número errado e
não como uma propriedade do JSX: **em JSX, `>` é ao mesmo tempo o fim de uma etiqueta e
metade de uma seta** — irmã exata da crase, que é delimitador e pontuação de prosa.

**E o caso falso fraco é o segundo achado, e o mais transferível.** Um fixture fabricado
prova o que ele contém. Se ele não tem a forma que o código real tem, o caso falso passa
com a régua quebrada e a dupla verificação vira teatro. A régua desta casa era *"remova o
conserto e veja ficar vermelha"*; o que faltava é que **o caso fabricado tem de se parecer
com o código real**, e a diferença entre `onPress={f}` e `onPress={() => f()}` foi a
diferença entre uma guarda e um enfeite.

**O que mudou:** a leitura passou a achar o fim da abertura por profundidade de chaves,
ignorando `>` precedido de `=`; os fixtures ganharam a seta; e a guarda, consertada, achou
na primeira execução um alvo em `app/transfer.tsx` que a minha leitura manual dos trinta e
quatro `Pressable` tinha deixado passar. O piso virou constante (`ALVO`) e mora no
`Touchable`, que é quem carrega as etiquetas tocáveis — nove delas tinham 28 dp de alvo
porque o `Chip` é desenho e o toque mora no envoltório.

---

## 9 de setembro — inventei um achado de tablet e o guarda do plano o derrubou em dez segundos

**O que apareceu:** ao fotografar a 720 e a 1080 dp, vi a coluna de conteúdo travada em
600 dp com banda vazia dos dois lados, lembrei da linha do `CLAUDE.md` — *"uma coluna que
serve a 393 dp vira tira esticada a 800 dp: lá o certo é refluir em colunas"* — e escrevi
um item de fila dizendo que a página não reflui. `src/plano.test.ts` reprovou na primeira
execução: a palavra que eu usei como medida de AUSÊNCIA já existia no arquivo.

Fui ler, e o refluxo existe: `src/components/colunas.ts`, `PARES_A_PARTIR_DE = 840`, duas
colunas que empacotam em vez de uma grade com buraco. E existe a decisão de QUEM pareia,
escrita no componente: *"quem pareia é a tela cujo conteúdo é uma lista de peças do mesmo
tamanho e da mesma importância"* — a capa não, porque é editorial e parti-la destrói a
ordem que o dono aprovou; formulário não, porque em duas colunas o dedo volta para cima.
Almoxarifado e Ajustes não pareiam por essa razão, e estão certos.

**Por que importa:** este arquivo já registra três vezes o mesmo erro meu — *"antes de
chamar algo de defeito, procure a decisão"* — e esta é a quarta. A novidade é o gatilho:
as três anteriores vieram de eu ler código; esta veio de eu olhar uma **foto**. Uma foto
não tem docblock. Ela mostra o resultado sem a razão, e é por isso que ela é ótima para
achar o que está feio e péssima para julgar o que está errado.

**O que mudou:** o item saiu da fila no mesmo commit em que entrou, e fica esta linha no
lugar dele. E a régua que sobra: **um item nascido de uma foto passa pela busca da decisão
antes de virar item** — `grep` no componente, no `insights.md` e nas decisões do
`CLAUDE.md`. Foi o guarda do plano que me pegou, não eu; sem a medida obrigatória ao lado
de cada item, o achado inventado teria virado trabalho para a próxima sessão.

---

## 9 de setembro — o conserto criou o defeito oposto, e só olhar QUEM CHAMA mostrou

**O que apareceu:** `recordCheck` não impedia conferir a mesma remessa duas vezes. A
segunda chamada lia as pernas positivas do grupo de novo, recalculava a mesma diferença e
gravava outra linha: com 6.000 mandados e 5.500 contados, a prateleira fica com 5.500 e o
livro passa a dizer 5.000. Um toque repetido na doca — que é onde o dedo está de luva e a
tela está molhada — corrompia o saldo sem nada acusar.

O conserto é o da casa: recusa nomeada, e a correção pelo estorno, porque a fundação diz
que se corrige por estorno e nunca por sobrescrita.

**E a recusa criou um defeito novo, na tela.** A tela de transporte confere percorrendo as
remessas do DIA — uma loja pode receber duas cargas. Com a recusa, a carga da tarde ficava
presa atrás da recusa da carga da manhã: o toque não conferia nada e a tela dizia "não deu
para gravar". Antes o mesmo toque conferia a segunda e estragava a primeira; depois, não
conferia nenhuma. **Um conserto que cria o defeito oposto não é conserto.**

Nada disso aparece na camada de dados. A função passou a estar certa sozinha, com o teste
verde, e a tela passou a estar errada — e o que mostrou foi ir ler o chamador antes de
fechar. `shipmentsOn` ganhou `pendentes`, e a tela percorre o que FALTA em vez do que
aconteceu.

**A régua que fica:** quando uma escrita passa a RECUSAR o que antes aceitava, o trabalho
não acaba na função. **Vá ler quem chama, e pergunte o que ele fazia com a chamada que
agora falha** — em laço, então quem vem depois dela para; num `Promise.all`, então o
resultado inteiro cai; num caminho de retentativa, então ele repete para sempre. Recusa
nova é mudança de contrato, e contrato se lê dos dois lados.

**E uma correção ao próprio achado, que vale mais que ele.** A auditoria dizia "a
conferência que não é idempotente", e eu passei a primeira meia hora medindo `recordCount`
— a contagem de prateleira — que é idempotente no saldo: contar 100 duas vezes escreve
+10 e depois 0, e o saldo dá 100 nas duas. A palavra "conferência" neste repositório é
`discrepancy`, o posto de controle da doca, e não `adjustment`. **Medi a função errada
porque li o rótulo em vez do vocabulário**, e só achei o defeito quando fui atrás de onde
a palavra vive no código.

---

## 9 de setembro — o aplicativo tratava a mesma pessoa de dois jeitos, e a auditoria contou três

**O que apareceu:** o espanhol misturava `tú` e `usted`. Não por tela: **dentro da mesma
frase**. A confirmação de cadastro de insumo abre com *"**Vas** a dar de alta..."* (tú) e
fecha com *"si aún no lo **compró**, **registre** la factura"* (usted). Na ficha do item
eram cinco frases em `usted` e uma em `tú`, lado a lado.

**A auditoria disse três segundas pessoas. São duas.** `vos` e `vosotros` não aparecem em
lugar nenhum do arquivo. Corrigi o número em vez de repeti-lo — e vale registrar porque um
número de auditoria carregado sem medir é a mesma doença de um item de plano carregado sem
medir, que este arquivo já registra: *"a lista é a entrada de um laço automático e ninguém
mede o que ela afirma"*.

**Por que importa:** os outros dois idiomas da MESMA tela dizem "você" e "you". `usted`
põe distância onde o resto do aplicativo não põe, e a régua de tom desta casa pede o
contrário — *"frase curta, verbo na frente, segunda pessoa"*, orientando em vez de
fiscalizar. Um cliente hispanofalante não vê uma escolha de registro: vê um aplicativo que
não sabe com quem está falando.

**E a régua da guarda foi o trabalho de verdade.** Contar `usted` é fácil; separar
imperativo formal de subjuntivo não é, porque as formas são idênticas — *"a quien lo
**tenga**"* e *"hace que cada persona **vea**"* são espanhol correto nos dois tratamentos,
e estão no arquivo. Uma guarda que os acusasse mandaria consertar o que está certo, que é
o alerta inventado virado para o texto. Então ela pega as duas formas em que `usted` é
inequívoco — a palavra, e o imperativo em COMEÇO de frase, onde subjuntivo nunca aparece —
e a fronteira está escrita no docblock em vez de subentendida.

**A régua que fica, e ela já se pagou duas vezes hoje:** minha varredura manual dos
trinta e quatro `Pressable` perdeu um, e minha leitura manual do dicionário perdeu dois
(*"Guarde una copia"*, em duas telas). **Onde a guarda é escrita, ela acha o que o olho
perdeu na mesma passada** — e é por isso que ela vem antes de eu declarar o item fechado,
não depois.

---

## 9 de setembro — a lista ordenava pela palavra do esquema, e o esquema fala inglês

**O que apareceu:** a lista de Lugares usava `ORDER BY kind`. `kind` é a coluna do
esquema, e o esquema fala inglês: `cold_room, customer, factory, own_store, store_room,
vehicle`. Em português a tela mostrava *Câmara fria, Cliente, Fábrica, Loja própria,
Almoxarifado, Veículo* — o almoxarifado da própria fábrica em quinto, depois dos clientes.
Nem alfabético, nem nada. Em espanhol sairia numa terceira ordem, pelo mesmo acidente.

**Por que importa:** é uma fronteira de idioma escondida numa cláusula que ninguém lê como
texto. Este projeto tem a regra *"nenhuma tela guarda uma palavra"* e a cumpre com rigor —
e aqui a palavra não estava na tela, estava na ORDEM dela. A tradução some do diff, o
`Widen<T>` não alcança, e o defeito só existe para quem lê a lista num idioma que não é o
do banco.

**E o conserto óbvio era outro acidente.** Ordenar alfabeticamente no idioma da vez trocaria
uma ordem sem sentido por outra que muda de idioma para idioma. A Lei pede que a tela
responda **o que é normal ali** — e o normal é a fábrica primeiro, porque é onde a pessoa
está; depois as salas dentro dela; depois quem recebe carga; e o caminho por último. Essa
ordem é a mesma nos três idiomas porque não é sobre letras, é sobre o negócio.

**A régua que fica:** `ORDER BY` de uma coluna de ENUM é uma decisão de apresentação
disfarçada de detalhe de consulta. Quando a lista aparece para alguém, pergunte em que
idioma aquela coluna está — e se a resposta for "no do banco", a ordem é acidente.

A ordem virou lista do domínio, e a guarda a compara com o enum `location_kind` do
Postgres — a fonte que não passou pela mão de quem escreveu a lista, que é a regra desta
casa para toda derivação.

---

## 9 de setembro — o detector honesto documenta o buraco; a promessa continua inteira

**O que apareceu:** o teste que garante leitor para o dicionário media **seção**, e dizia
isso de si mesmo num docblock: *"o que este teste NÃO confere, dito em vez de omitido: ele
mede SEÇÃO, não chave"*. A frase é honesta e o teste é bom. E o dicionário tinha **39
folhas mortas** dentro de seções vivas — `app.home` tem leitor, `weather` tem leitor,
`app.productForm` tem leitor, e as três somavam 22 frases que nenhuma tela diz.

**Por que importa:** honestidade em comentário protege quem lê o teste. Quem lê a promessa
— o `CLAUDE.md`, o roadmap, o próximo eu numa sessão nova — lê que o dicionário tem leitor.
O projeto já tinha a regra escrita (*"se a promessa é boa, feche o buraco; se não é,
corrija a promessa"*) e ela nasceu de uma guarda de capacidades com o mesmo formato: o
docblock admitindo dez de treze enquanto o documento prometia todas. **Duas vezes, o mesmo
molde** — e é isso que o torna uma régua e não um caso.

**A parte que quase me fez desistir da medida.** A varredura por chave acusou 44 e o
docblock dizia, com razão, que *"boa parte é falso positivo do detector"*. Falso positivo
tem causa nomeável ou não é falso positivo: aqui era **índice dinâmico** —
`words[recusa]` em `app/backup.tsx` lê três chaves sem escrever o nome de nenhuma, e
`words` é um apelido de `t.app.backup` criado três linhas acima. Ensinar isso ao detector
levou vinte linhas e derrubou o número para 39 de verdade. O caminho errado era o
disponível: aceitar o docblock, chamar 44 de ruído, e a doença que o `CLAUDE.md` nomeia
segue crescendo por mais um mês.

**E a régua fica com perda de precisão de propósito**, porque a direção do erro importa:
todo caminho indexado conta como lido **inteiro**, do ponto do índice para baixo. Isso
deixa chave morta passar e nunca acusa chave viva. Guarda que acusa o vivo é alerta
inventado com outro nome — e ensina exatamente o mesmo: a ignorar.

**O achado dentro do achado:** das 39, **35 eram sobra e duas eram tela calada** — e a
segunda é a que paga a varredura. `app.lotLabel.scanUnknown` diz *"esse código não é de um
lote desta fábrica"*, e ninguém a dizia porque a etiqueta responde *"esse lote não está
mais aqui"* a **todo** código que ela não acha. Quem aponta a câmera para um quadrado de
refrigerante na doca recebe o aplicativo afirmando um passado que não houve. Não é
enfeite: é a casa que escreveu *"nunca culpa pessoa"* e *"a confirmação diz o que vai
acontecer"* mentindo sobre um fato, na tela onde alguém está de luva com pressa.

**E o conserto ensinou onde NÃO procurar a diferença.** O reflexo é validar o formato:
`AAAAMMDD-NN`, onze caracteres, dá para checar. `src/domain/lot.ts` diz por escrito que
esse é *"o padrão, não a única forma"* — a fábrica com código próprio vai usar o dela, e
recusar por forma chamaria o código legítimo dela de estranho. O que separa *"sumiu"* de
*"nunca foi"* não está no código: está em **quem trouxe**. Lista que o aplicativo acabou
de desenhar → o lote existia. Câmera ou dedo digitando → pode nunca ter existido. É fato
que o chamador já tem, e passá-lo custa um parâmetro.

**A régua que fica:** quando um detector se declara impreciso, pergunte de que forma de
leitura ele não sabe — não quantos falsos ele produz. E quando duas frases parecem dizer o
mesmo em tons diferentes, o que as separa quase nunca é o dado; é o caminho por onde
alguém chegou.

---

## 9 de setembro — campo sem leitor não é peso morto, é anestesia

**O que apareceu:** `PickLine.available` estava calculado numa subconsulta e lido por
ninguém. O caminho fácil era apagá-lo — é o que o portão P1 manda fazer com peça sem
chamador. Antes de apagar, a pergunta: *por que alguém escreveu isto?* O docblock
respondia — *"de nada adianta saber que a fábrica tem trezentos se eles estão na outra
câmara"* — e a tela já tinha esse número por outro caminho (`stockByPlace`), o que
confirmava a duplicata.

**Só que os dois caminhos não alcançam as mesmas linhas.** `stockByPlace` não devolve
linha de saldo zero, e está certo: *"listá-lo como 0 g enche a tela de coisa que não está
ali"*. Então o item que a loja pediu e a câmara não tem **desaparece por completo** da
tela de carga: não está na lista para ser escolhido, não tem `line`, e nenhuma das frases
fala dele. Quem carrega o caminhão descobre na loja. `available` é o único número que vem
pelo eixo do PEDIDO — o eixo em que a ausência é visível.

**Por que importa:** a duplicata aparente não era duplicata, era o mesmo cálculo por
outro eixo, e o eixo era o ponto. Apagar o campo teria fechado o item da auditoria e
enterrado o defeito junto — com o commit dizendo "removida aritmética duplicada", que é
uma frase verdadeira sobre um trabalho errado.

**E o achado que paga a rodada apareceu ao LIGAR o leitor.** A chave da `useQuery` da
separação era só o destino, e `available` é o único campo dela recortado por SALA. A
sala de origem é estado da tela e um toque. Ou seja: a tela ia dizer *"não há nenhum na
Câmara fria"* mostrando o saldo do Almoxarifado — e o defeito **nasceu junto com o
leitor**, sem que o leitor o tivesse causado. Ele estava ali desde que a chave foi
escrita, dormindo porque o único campo que dependia dele não era lido por ninguém.

**A régua que fica:** campo sem leitor não é só peso — ele **anestesia todo recorte que
existe só para ele**. Antes de ligar um leitor a um campo dormente, confira o que aquele
campo recorta e se quem o busca ainda sabe disso. E antes de apagar um campo por não ter
chamador, pergunte por qual EIXO ele chega ao dado: dois caminhos que dão o mesmo número
para as linhas que ambos veem podem estar vendo conjuntos de linhas diferentes.

**E a guarda nova não mordia na primeira versão** — procurava `from` no recorte inteiro,
e `from` está dentro da própria chamada. Verde com a chave errada. É o terceiro caso do
mesmo molde nesta semana (o `indexOf('>')` do piso de toque, o `^UPDATE` do backfill, e
agora este): **guarda que procura um nome perto do lugar certo casa com o lugar errado.**
A prova nunca é o exemplo que eu escrevo — é rodar contra o código anterior e ver
vermelho.

---

## 9 de setembro — a régua que mede legibilidade só olhava para o texto

**O que apareceu:** `src/theme/contrast.test.ts` é rigorosa e cara: mede tinta sobre
papel, acento sobre fundo, palavra de botão, hierarquia entre as três camadas de tinta,
e lê o arquivo de tokens em vez de importar para que cor nova entre na medição sozinha.
Ela não media **separador**. E o separador é o que carrega a estrutura no Papel — uma
pele que, por decisão de desenho, **não tem caixa**: sem a régua, não há bloco.

Medido pela primeira vez: `organicoClaro.line` dava **1,06:1** contra o papel dele.

**Por que importa:** 1,06 não é uma linha fraca. A diferença que o olho distingue entre
duas áreas planas grandes fica por volta de 1,2:1 — abaixo disso as duas cores são uma
cor só. O divisor do dia do Orgânico existia no código e não existia na tela, e nenhum
teste podia acusar, porque nenhum teste olhava para ali.

**A régua que fica, e ela é sobre RÉGUAS:** uma guarda cobre exatamente o vocabulário
que ela nomeia. Esta se chamava "o texto pequeno tem de ser legível" e cumpria isso
inteiro — o buraco não era descuido, era **escopo**, e escopo não aparece quando se lê
o teste passando. A pergunta que acha esse tipo de buraco não é *"este teste está
certo?"* e sim *"o que ele NÃO nomeia?"*. Aqui: tudo que é desenhado e não é letra.

**E o piso de uma guarda nova é o problema todo.** Escolher "3:1, que é a WCAG
não-textual" teria transformado uma régua de página em borda — outra pele, não esta.
Escolher por gosto é o que este projeto proíbe. A saída estava escrita duas vezes: o
`PASSO` da tinta derivou o piso dos temas escuros *"que estavam prontos"*, e o dono
decidiu que *"o Papel é o produto e o Orgânico é a opção"*. Então a pele que ele vê todo
dia é o piso, e as cores saem de `mistura(ink, paper, α)` — a régua de cada pele na
tinta dela, em vez de um cinza emprestado.

**Com uma metade absoluta, e essa metade é a parte que eu quase não escrevi.** Um piso
lido do mesmo arquivo que a guarda mede é a guarda que compara duas coisas escritas pela
mesma mão — o projeto já pagou por uma, na tabela de capacidades que foi *escrita a
partir* da guarda. Sem a metade absoluta, baixar a referência faz tudo passar, e o
verde fica lindo.

**E a guarda cobrou o próprio Papel na primeira execução:** as duas réguas dele estavam
a 1,32× de distância, abaixo do passo de 1,35 que o teste da tinta já exigia para não
ter *"três nomes para um cinza"*. Guarda nova que só acusa a pele dos outros é guarda
escrita para passar.

---

## 9 de setembro — a repetição na SILHUETA, onde cada curva sozinha está bonita

**O que apareceu:** as duas colinas do Orgânico eram a mesma curva duas vezes. Mesma
amplitude, mesmo ritmo, cristas no mesmo x, uma onze unidades abaixo da outra. Ninguém
tinha visto porque **cada curva, sozinha, está bonita** — o defeito só existe no par, e o
par é a coisa que ninguém olha quando está desenhando uma delas.

**Por que importa:** o dono já deu a régua para isto, com uma palavra — *"feio"* — sobre
uma fileira de quatro lojas idênticas, e o `CLAUDE.md` a registra como sendo sobre
OBJETOS: *"repetição regular lê como padrão de papel de parede"*. Ela vale igual para a
silhueta, e ali é mais difícil: quatro lojas idênticas se contam; duas ondas paralelas se
leem como "uma paisagem". O resultado é o mesmo — uma faixa grossa com uma listra em vez
de profundidade.

**E o conserto tinha uma armadilha que o desenho denunciou.** A primeira tentativa
endireitou a colina de longe: o defeito sumia e a **onda** sumia junto — e a onda é a
assinatura desta pele. Corrigir um defeito matando a identidade é o mesmo erro que trocar
correção por aparência, virado do avesso. O que a distância faz de verdade não é
endireitar, é **achatar**: relevo menor, não relevo nenhum.

**A parte que quase me fez errar:** eu comparei as duas curvas no vazio. O **pátio** —
silo, galpão, poste — mora ENTRE as camadas, e a candidata que parecia melhor sozinha
enterrava o galpão até o telhado. Uma silhueta não se julga fora da cena em que ela
recorta alguma coisa.

**A régua que fica:** procure a repetição também onde ela não tem contorno. Objetos
repetidos se contam; ritmos repetidos — duas curvas, dois vãos, dois tempos de animação —
passam por composição. E ao consertar, pergunte que parte do que vai sair é o DEFEITO e
que parte é a assinatura: elas moram na mesma linha com frequência.

---

## 9 de setembro — a barra dizia "nada" para script, e o repositório se mede a si mesmo

**O que apareceu:** a tabela da barra de verificação abre com *"Ambiente, script,
documentação, design → **nada** — o que prova é a coisa funcionar"*. Eu segui essa linha
ao pé da letra: acrescentei `scripts/prancha.mjs` (cem linhas), rodei o script, vi a foto
que ele produz, e empurrei sem rodar a suíte. O CI ficou vermelho.

**Por que:** `src/bar.test.ts` mede o **tamanho do repositório inteiro** contra o número
escrito no `docs/roadmap.md`, com folga de 10%. Cem linhas foram o que faltava para
cruzá-la. O teste está certo e a linha da tabela está errada — não sobre o script, sobre
o repositório.

**A parte que vale mais que o conserto:** este projeto tem uma família inteira de guardas
que medem o PRÓPRIO repositório — contagem de linhas, contagem de testes, contagem de
garantias do Postgres, a tabela *"medido, não afirmado"*. Elas existem para que o
documento não envelheça sozinho, e a consequência é que **nenhum arquivo é neutro**: um
`.md` novo mexe na contagem igual a um `.ts`. A tabela da barra foi escrita pensando em
"o que este arquivo pode quebrar", e a resposta certa é "o que a EXISTÊNCIA deste arquivo
pode quebrar".

**A régua que fica:** quando um projeto se mede, a pergunta "preciso rodar a suíte para
isto?" muda de forma. Não é mais sobre o que o arquivo faz — é sobre se ele **conta**. E
aqui tudo conta. A tabela ganhou a exceção por escrito: arquivo novo, de qualquer tipo,
roda `npm test` antes do push; edição dentro de arquivo existente segue a tabela.

**E há uma ironia que não é ironia:** o commit que quebrou o CI foi o que criou uma
ferramenta cuja razão de existir é *não precisar do ciclo caro para ver uma coisa
pequena*. Atalho novo tende a ser usado antes de se saber onde ele não vale — e o preço
da primeira vez é justamente descobrir isso.

---

## 9 de setembro — a guarda `count > 0` que ninguém examinou, achada pela foto

**O que apareceu:** as abas do Almoxarifado mostram "Insumos 4", "Embalagem 2" e
"Material de loja" — sem número. Não é corte: há espaço vazio embaixo, e o número
simplesmente não existe. A causa é uma linha: `{count > 0 ? … : null}`.

**Por que importa, e a prova é o que eu mesmo pensei:** olhei a foto e li *"não
carregou"*. Eu escrevi o código. Se quem escreveu lê como falha, quem está de luva na
câmara fria lê igual — e o defeito não é estético: a contagem existe para responder *"tem
alguma coisa aqui?"* **antes** do toque. Escondida, ela torna "não tem" indistinguível de
"não carregou", e a pessoa toca para descobrir. Ou seja, esconder o zero destrói
exatamente o trabalho que o número fazia.

**E não havia razão escrita.** O docblock ao lado explica com cuidado por que o nome e a
contagem ficam em linhas separadas (o `·` quebrava no fim da linha) e por que são três
colunas e não um rolamento. Sobre o `count > 0`, nada. É o formato mais comum de defeito
neste repositório: não a decisão errada, mas **a linha que ninguém decidiu** — escrita por
reflexo ("zero é feio"), cercada de vizinhas bem pensadas, e por isso lida como se também
tivesse sido pensada.

**A régua que fica:** num arquivo bem documentado, procure a linha SEM comentário. A
densidade de explicação em volta faz o silêncio parecer intenção, e a vizinhança boa é
justamente o que impede a pergunta. E `x > 0 ? … : null` merece a pergunta sempre: esconder
o zero é afirmar que a ausência não é informação, o que quase nunca é verdade num
aplicativo cuja Lei 7 diz que "está tudo bem" é um estado.

**A segunda coisa, que veio junto:** com o número de volta, o rótulo que quebra em duas
linhas empurrava o número dele para baixo dos outros dois. Três números em alturas
diferentes leem como desalinho, não como "este rótulo é mais comprido" — as colunas
passaram a esticar e a contagem desce até o pé.

---

## 9 de setembro — o `tail` que apagou a prova, e a hora que eu gastei atrás dela

**O que apareceu:** rodei `npm run e2e:fast 2>&1 | tail -25`. O relatório disse *"51/53
passaram, 2 fatia(s) terminaram vermelhas"*. Fui procurar quais e não achei nenhuma linha
`FAIL` — então concluí que o corredor **esconde** o que uma fatia vermelha disse, e passei
a rodada seguinte melhorando o corredor.

**O corredor estava certo.** Ele imprime as linhas `FAIL` e a explicação indentada; elas
estavam na saída, e o meu `tail -25` as jogou fora — 22 linhas guardadas de 51. Eu
diagnostiquei a ferramenta por uma ausência que eu mesmo tinha produzido.

**Por que importa mais do que parece:** este arquivo já tem a regra do `&&` (*"quem decide
o `&&` é o último cano, não o veredito"*), e ela é sobre o **código de saída**. Esta é a
mesma forma aplicada à **prova**: um cano no fim de uma verificação não muda só o
veredito, ele apaga a evidência. E a evidência apagada não volta — a segunda execução,
inteira, deu **53/53**, e agora não dá para dizer se as duas de antes eram instabilidade
ou defeito. As duas respostas continuam possíveis e nenhuma é verificável.

**A régua que fica:** verificação escreve em arquivo, e o arquivo se filtra depois. `>
log 2>&1` custa nada e o log fica lá para a quinta pergunta que só ocorre depois da
quarta resposta.

**E o que sobrou de bom:** a melhoria do corredor vale mesmo tendo nascido de diagnóstico
errado — uma fatia que morre ANTES de qualquer checagem (porta ocupada, exportação
quebrada, navegador que não abre) realmente não imprime nenhuma das três linhas que ele
repassa, e para essa continuava mudo. Ferramenta consertada pelo motivo errado ainda é
ferramenta consertada; o que não se pode é deixar o motivo errado escrito como se fosse a
história.

---

## 9 de setembro — o item dizia UM rendimento, e eram dois

**O que apareceu:** o roadmap pedia `yield` na versão da ficha, e a frase era *"hoje
corrigir o rendimento reescreve o que a versão de janeiro dizia"*. Ao medir antes de
construir, o quadro ficou melhor **e** pior do que o item afirmava.

Melhor: três camadas já protegiam o passado. As linhas da ficha são versionadas, o lote
carimba de que versão saiu (com o motivo escrito na `0002`, palavra por palavra o mesmo
raciocínio), e o custo unitário congela no próprio movimento.

Pior: **eram dois rendimentos, não um.** `recipes.yield_amount` (quanto uma batelada rende
de massa) e `products.yield_per_unit` (quantas unidades saem dela). Os dois são campo
único, e `saveRecipeVersion` grava a receita com `on conflict do update set yield_amount =
excluded.…` — então salvar a versão 3 faz as versões 1 e 2 passarem a afirmar o número de
hoje. Três camadas contra o mesmo defeito, e ele escapou pela porta que ninguém olhou.

**A régua que fica:** quando um item nomeia UM campo, procure os irmãos dele antes de
mexer. `yield_per_unit` estava no item; `yield_amount` estava na mesma frase do mesmo
código, na tabela ao lado, com o mesmo defeito e nenhum nome. Item de lista é um exemplo
do problema, quase nunca o inventário dele.

**E o conflito de portões, resolvido com nome:** o P1 diz *"sem chamador, não entra"*, e
nenhuma tela lê hoje uma versão antiga — o editor mostra a atual, e o histórico de fichas
não existe. O P3 diz que forma de esquema se adivinha de graça enquanto há zero linhas. Os
dois se aplicam e apontam para lados opostos.

O que desempata não é a ordem dos portões: é **o que se perde por esperar**. Uma coluna sem
leitor que se pode acrescentar depois obedece o P1 e espera. Esta não: o rendimento de uma
versão passada, depois que a primeira fábrica produzir, **não está em lugar nenhum para ser
reconstruído**. Não é migração cara — é migração impossível. O P1 protege contra peça
inútil; ele não foi escrito para o caso em que esperar destrói a informação. A fronteira
fica escrita nos dois arquivos de migração, com o nome de quem vai ler.

---

## 9 de setembro — o enfeite comeu a página, e a rede que faltava era do enfeite

**O que apareceu:** a capa do primeiro dia, fotografada no emulador, mediu **1,56:1** de
contraste — num piso de 4,5:1 — enquanto a barra de abas da MESMA foto media 15,35:1 e as
outras telas da MESMA instalação mediam 15,5:1. Parecia tinta clara, e não era.

**O que a conta dos pixels disse, antes de eu abrir um arquivo:** um alfa só (0,215)
explica os três canais de todas as cores da página — a manchete, o texto do corpo, o azul
do link. Cor errada não faz isso; **opacidade** faz. E a geometria fechou por outro
caminho: as réguas da página mediram 922 px onde a coluna sem escala tem 948, e
`enterScale` (0,965) com a chegada em 0,217 dá exatamente 922. Duas medidas
independentes, o mesmo número: era a **animação de entrada congelada a 22% do caminho**,
com a página 20 dp abaixo do lugar. Ficou assim por minutos, atravessando rolagem e
navegação.

**A causa estava fora da peça.** O aparelho parado na capa queimava **190% de CPU** e
alocava 130 mil objetos a cada 39 segundos, com a thread de JavaScript a 0,4% — ou seja,
não era laço de renderização: era a thread de UI, que é onde as trinta e oito animações de
ambiente desenham atributos de SVG quadro a quadro. A mola da entrada corre nessa mesma
thread. Ligar "reduzir movimento" no aparelho e reabrir devolveu os dois números de uma
vez: **CPU de 190% para 22,6%**, e a mesma capa com tinta cheia (33,30,26) e a régua de
volta aos 948 px.

**Por que isso é achado e não conserto de bug:** o `Reveal` documenta, desde antes, que
começa visível *"porque se o caminho da animação falhar, o pior caso é a tela aparecer sem
a entrada, e nunca uma tela em branco com o banco cheio de dado"*. A promessa valia para o
valor inicial e morria duas linhas depois, onde a opacidade vai a zero e a volta fica por
conta da mola. **Enfeite que falha tinha permissão de levar o conteúdo junto** — e levou.
Agora a entrada tem teto: passado o dobro do assentamento da mola, a página aparece,
tenha a animação chegado ou não.

**A régua que fica, e ela é maior que esta tela:** *movimento e conteúdo não podem
compartilhar um destino*. Toda vez que um enfeite decide se um texto é legível — opacidade,
escala, altura animada —, existe um caminho em que o texto some por um motivo que não tem
nada a ver com ele. A pergunta a fazer em cada um: **se esta animação nunca chegar, o que a
pessoa vê?** Se a resposta não for "a tela inteira, parada", falta uma rede.

**E uma fronteira dita em voz alta, para não virar promessa falsa:** os 190% são de um
emulador por software, sem GPU e sem KVM. Não afirmo que o número se repete no tablet do
dono — afirmo que a thread de UI é o recurso disputado, que o custo do ambiente é o maior
do app, e que **nada no repositório mede isso hoje**. A doutrina do movimento fala de
duração de ciclo (4 a 12 s) e não fala de quantos ciclos correm juntos nem do que custam.
O teste no aparelho dele é o que responde.

---

## 9 de setembro — a janela que nunca para deixa a tela ilegível para quem não tem olhos

**O que apareceu:** indo confirmar QUE tela eu tinha fotografado, o `uiautomator dump`
falhou três vezes em três, e a terceira nomeou a causa: **`ERROR: could not get idle
state`**. Com "reduzir movimento" ligado e o app reiniciado, o mesmo comando devolveu 128
nós e 18 textos em quinze segundos — a capa inteira, palavra por palavra.

**Por que importa mais do que a ferramenta:** as trinta e oito animações de ambiente
mantêm a janela permanentemente ocupada, e o `uiautomator` espera ociosidade. Isso não é
lentidão de emulador: é o que animação infinita significa. E o cano que ele usa é o mesmo
da acessibilidade. Não meço TalkBack daqui, então não afirmo que ele quebra — mas a
pergunta ficou de pé e escrita, e o aparelho do dono responde.

**O que mudou por causa disso, dentro do repositório:** `oQueDizATela()` devolve lista
vazia em operação normal, e o `try/catch` engolia. Então `mesmaTelaEmTodas` — a guarda que
existe para pegar "a navegação não pegou numa das cinco larguras" — vinha comparando
listas vazias e **não podia falhar**. O `CLAUDE.md` a descreve como funcionando.

**E a régua que fica:** *guarda cujo insumo pode vir vazio precisa distinguir vazio de
falha.* O `catch` que devolve `[]` transforma "não consegui ler" em "li e não havia nada",
e as duas levam a conclusões opostas. Foi assim que uma guarda escrita, documentada e
elogiada passou semanas sem poder acusar coisa alguma.

---

## 9 de setembro — o número que não descrevia a imagem ao lado dele

**O que apareceu:** fotografei a capa para provar um conserto, o comando disse `tinta
15,35:1`, e a imagem no arquivo era a **tela de abertura** — o app tinha acabado de ser
instalado e ainda subia.

**A causa não era a régua estar errada; eram duas capturas.** `screencap -p` gravava o
arquivo, e a régua tirava um SEGUNDO quadro, segundos depois. Entre os dois, o app saiu da
abertura e desenhou a capa. Cada metade estava certa sobre a tela que viu; juntas,
mentiam. E mentiam do jeito pior: o número passa a prova sem prová-la, porque quem lê
supõe que ele descreve a imagem ao lado.

**O que mudou:** uma captura só, crua, que vira o arquivo E a medida — com um codificador
de PNG de quarenta linhas em vez de tentar sincronizar duas capturas. Três blocos e um
CRC, sem dependência nova.

**E a régua ganhou o que faltava junto:** ela agora diz também **em quantas fitas há
tinta**. A mediana responde *"tem tinta nesta página"*; ela nunca respondeu *"é a página
certa"*, e eu li como se respondesse. A abertura tem 3 fitas de 22; qualquer tela do
aplicativo tem 13 ou mais. O sinal já estava calculado e era jogado fora.

**A régua que fica:** *duas medidas de instantes diferentes não descrevem o mesmo fato*.
Onde um número acompanha uma prova, ele tem de sair da mesma captura que a prova — senão
ele é uma segunda afirmação disfarçada de legenda.

---

## 9 de setembro — consertei um arquivo, provei no aparelho, e havia mais cinco

**O que apareceu:** meia hora depois de fechar a rede da entrada no `Reveal` — com a
foto do aparelho provando a capa em 15,35:1 onde media 1,56:1 —, a tela de Produção
apareceu com o cartão inteiro e o botão *"Adicionar produção"* desbotados. `Alive` tem as
mesmas cinco linhas do `Reveal`: zera a opacidade e entrega a volta à mola. E atrás dele
`Sparkline`, `Bars`, `Drain`, `Sky` e a peça da capa.

**Seis cópias do mesmo raciocínio, e eu tinha olhado uma.** A regra deste projeto já
existe e está escrita há dias — *"conserto de pele não termina no arquivo que o mostrou…
a rodada só fecha depois de `grep` pelo que MAIS desenha aquilo"*. Eu a citei nesta mesma
sessão, para outra coisa, e não a apliquei aqui.

**E o que cada uma esconde não é a mesma coisa** — por isso nenhuma é enfeite:

| quem | o que some quando a mola não chega |
|---|---|
| `Reveal` | a fila inteira da capa |
| `Alive` | o cartão e o botão da tela |
| `Sparkline` | a curva |
| `Bars` | a altura das colunas — o gráfico passa a MOSTRAR outro número |
| `Drain` | o quanto falta no tanque |
| `Peca` | o detalhe que a pessoa acabou de abrir |

O `Bars` é o pior dos seis e é o que menos parece: uma coluna parada no chão não *some*,
ela **afirma zero**. Enfeite que falha calado vira dado errado.

**O que mudou:** a rede virou uma função só (`src/components/chegada.ts`) e as seis a
chamam. E — o que importa mais — a guarda deixou de olhar um arquivo e passou a
**varrer** `src/components` e `src/home`: qualquer peça que comece parada no ponto de
partida e não chame a rede fica vermelha. Ela apontou o próprio `Reveal` na primeira
execução, porque ele ainda tinha a rede escrita à mão, e isso é a guarda funcionando.

**A régua que fica:** *guarda de um arquivo protege um arquivo*. Quando o defeito é um
RACIOCÍNIO repetido, a guarda tem de ser uma varredura — senão ela documenta o conserto
em vez de garantir a regra, e a próxima cópia entra sem barulho.

---

## 9 de setembro — a capa afirmou sobre a fábrica sem ter conseguido lê-la

**O que apareceu:** caminhando pelo aplicativo, a capa apareceu com a linha de olho e
mais NADA — nem manchete, nem cena, nem peça —, e ficou assim. Sem exceção no log, sem
tela de erro, sem uma palavra. Tocar em Início não trouxe nada de volta.

**A causa estava no TIPO.** A capa é uma consulta só. Quando ela falha, `useQuery`
devolve `data` nulo, e `CoverState` só admitia três valores: `loading`, `firstDay`, `day`.
Nulo virava `'loading'` — então **uma leitura que falhou era indistinguível de uma que
ainda não voltou**, e a tela esperava para sempre. A falha não tinha para onde ir.

**E o pior não foi o vazio.** Um quadro antes, com metade da resposta, a capa escreveu
*"Parada agora: nada em produção, nada feito e nada saiu hoje"* — uma frase sobre a
fábrica, dita sem ter conseguido ler a fábrica. **Falha que se disfarça de fato é pior que
falha barulhenta**: o dono lê "nada saiu hoje" e acredita. Este repositório inteiro existe
para proteger números que alguém vai usar para decidir onde pôr dinheiro, e aqui a tela
inventou um.

**E é sistêmico, não da capa.** Medido: **52 chamadas de `useQuery` com desestruturação em
todo o aplicativo, e ZERO pedem o campo `error`** — enquanto o docblock do próprio gancho
diz, desde que foi escrito, que ele devolve *"os dois estados que uma tela de fato tem de
desenhar: carregando e falhou"*. O estado "falhou" existe no gancho e não é desenhado em
lugar nenhum. Toda tela do NORVA, quando a leitura dela falha, mostra um estado vazio.

**O que mudou agora:** `CoverState` ganhou `'falhou'`, o erro atravessa até a capa, e a
capa diz o que aconteceu com a próxima ação ao lado ("Ler de novo"). O teste cobra a
distinção nos dois sentidos — com erro é falha mesmo com resposta na mão; sem erro nada
vira falha.

**A régua que fica:** *um tipo que não tem o estado ruim obriga a tela a mentir*. Não foi
descuido de quem escreveu a capa: com três estados no tipo, `null` só podia virar
"carregando". Onde houver leitura que pode falhar, o estado "falhou" entra no TIPO — senão
ele vira silêncio, e silêncio numa tela de gestão é lido como fato.

---

## 10 de setembro — as duas medidas consertaram a TELA e não consertaram o CUSTO

**O que se esperava:** o movimento de ambiente queimava 190% de CPU com a tela parada, e
a thread de UI saturada era o que fazia as páginas aparecerem pela metade. Duas medidas
sem mudar nada do que se vê — um relógio só no lugar de trinta e oito animações infinitas,
e pausa do compasso quando a tela sai de vista — e eu disse que a segunda seria o maior
ganho, porque o custo multiplicava pelo número de telas visitadas.

**O que a medida devolveu, no aparelho, com o movimento LIGADO:**

| | antes | depois |
|---|---|---|
| a capa desenha | esvazia até sobrar a linha de olho | **inteira, 15,35:1 em 20/22 fitas** |
| CPU com a tela parada | ~190% | ~150% |
| quadros por segundo | 1,7 | 4,2 |

**O defeito de tela acabou. O custo não.** E a parte que eu errei é a que ensina: eu previa
que parar as telas fora de vista dominaria, e ela quase não apareceu — porque a medida foi
feita numa tela só, e ali não há tela fora de vista para pausar. O ganho dessa medida é
real e é proporcional a **quantas telas a pessoa visitou**, coisa que uma medida de trinta
segundos numa capa recém-aberta não vê. Medir a coisa certa no cenário errado devolve um
número honesto que responde outra pergunta.

**O que sobra, e onde ele mora:** o custo restante não é das animações — é das
**escritas de propriedade de SVG quadro a quadro**. Um relógio ou trinta e oito, o número
de nós que escrevem props a cada quadro é o mesmo, e são eles que atravessam para a árvore
nativa. Reduzir isso é reduzir quantas coisas se mexem ao mesmo tempo, o que muda o que se
vê — decisão do dono, não minha.

**E a fronteira, que é o principal:** este emulador não tem GPU. Cada mudança de prop de
SVG é rasterizada na CPU aqui, e num aparelho de verdade não é. **Eu não posso concluir
daqui que 150% é um problema no tablet dele** — posso concluir que o defeito de tela
acabou e que o que resta tem um dono medível. O portão P2 deste projeto já diz o que fazer
com isso: *"eu mudaria isto se eu visse ___"* — e quem vê está do outro lado da conversa,
com um tablet na mão.

---

## 10 de setembro — o marcador do dicionário chegou à tela, e a régua que o pega quase não serviu

**O que apareceu:** criando uma ficha técnica no aparelho, a confirmação abriu com o
título **"Criar {{name}}?"** — o marcador cru, na cara de quem usa. O corpo logo abaixo
estava certo, porque passava pelo `fill` e o título não. Uma linha esquecida entre duas
que a fazem, num arquivo cujo comentário ao lado diz *"a confirmação diz o que vai
acontecer, com os números por extenso"*.

**A varredura achou um segundo, e ele é pior porque é invisível:** no Extrato o texto
visível passa pelo `fill` e o **`accessibilityLabel` da mesma linha usa a frase crua**.
Quem lê a tela com os olhos vê "Ver mais — 1 até aqui"; quem depende do leitor de tela
ouve *"Ver mais — {{n}} até aqui"*. O defeito só existe na metade que ninguém olha.

**E a régua quase entrou errada, três vezes:**

1. **Casando por nome de folha** (`.title`, `.more`, `.overline`) ela acusou duzentas
   linhas inocentes — nomes de folha se repetem entre seções. Passou a resolver o
   CAMINHO da chave, com o apelido por arquivo que a régua irmã já sabia fazer.
2. **Contando linhas** para achar o `fill` em volta, ela acusou sete frases legítimas: a
   confirmação da contagem escolhe entre elas num encadeamento de ternários e o `fill(`
   abre onze linhas acima. Passou a contar PARÊNTESES — anda para trás fechando o que se
   abriu, e quando sai de um, olha quem o abriu.
3. **Sem enxergar o padrão "escolhe agora, enche depois"**, ela acusou mais três telas
   onde a frase é guardada numa variável e enchida em seguida. Passou a seguir a
   declaração local até o `fill`.

Só depois disso ela ficou limpa nas 241 chaves com marcador — e, retiradas as duas
correções, aponta exatamente as duas linhas.

**A régua que fica:** *toda régua nova erra pelo lado de acusar demais, e o número de
falsos positivos é a medida de quanto ela ainda não entende do código.* Duzentos, sete,
três, zero — cada rodada foi uma coisa que o repositório faz e que eu não tinha lido.
Detector que acusa muito não é rigoroso: é ignorante, e a diferença aparece quando alguém
tenta usá-lo.

---

## 10 de setembro — a rede não bastava, porque o defeito era o texto depender da animação

**O que apareceu:** com a rede da entrada já no lugar, o relógio já compartilhado e a
capa já provada inteira, o editor da ficha técnica abriu com **170 dp de papel puro** onde
mora o cabeçalho — sem sobrancelha, sem título, sem cena. Não era transição: sobreviveu a
rolar para baixo e para cima. Medido, o vão é papel exato, sem tinta fantasma. E ligar
"reduzir movimento" trouxe o cabeçalho inteiro de volta.

**Isso prova a causa e mostra o tamanho dela.** A mola tinha ficado em **zero** — o caso
extremo —, e opacidade zero é o mesmo pixel que "não desenhado". A rede, que deveria
puxá-la para 1, não pegou naquela tela.

**E aqui eu tomei a decisão que estava adiando.** Perseguir por que a rede falha numa tela
específica é perseguir sintoma. A causa está uma camada acima: **a legibilidade do texto
estava pendurada no sucesso de uma animação** — e animação é a coisa menos confiável da
tela, porque depende de uma thread que o próprio aplicativo disputa.

Então a entrada deixou de dirigir opacidade. Ela sobe e cresce, e mais nada. A pior falha
possível passou de "página em branco com o banco cheio de dado" para "cartão vinte e seis
dp fora do lugar, a 96,5% do tamanho, e legível".

**O que se perde, dito por extenso:** o esmaecer da chegada. O que fica é subir e crescer,
que é o que o olho lê como *isto chegou agora* — e continua acontecendo quando tudo vai
bem.

**A régua que fica:** *não pendure a existência do conteúdo num efeito que pode não
acontecer.* Vale para opacidade, para altura animada, para qualquer coisa que decida entre
"visível" e "invisível" a partir de um valor que uma thread ocupada precisa entregar. Uma
rede embaixo do efeito ajuda; tirar o conteúdo de baixo dele resolve. E o docblock do
próprio `Reveal` já dizia a prioridade certa desde o começo — *"o pior caso é a tela
aparecer sem a entrada, e nunca uma tela em branco"* —, só que a conclusão tirada dele foi
a errada: que a opacidade precisava entrar junto.

---

## 10 de setembro — a árvore de acessibilidade volta a ler, e é ela que destrava a caminhada

**O que apareceu:** `uiautomator dump` respondia *"ERROR: could not get idle state"* em
toda tela do aplicativo, e eu tinha registrado isso como consequência da saturação da
thread de UI. Depois dos consertos do ambiente ele continuou recusando — mas com
`transition_animation_scale 0`, que é o que o aplicativo lê como "reduzir movimento", ele
lê a tela inteira em segundos.

**Por que importa mais do que parece:** com a árvore lida, o aparelho deixa de ser
dirigido por coordenada e passa a ser dirigido por TEXTO. Toque em `"Salvar como versão
2"` em vez de toque em `(540, 2053)`. Coordenada quebra quando o layout muda — que é
exatamente o que este projeto mede em cinco larguras — e mente quando alguma coisa está
por cima.

**E ela mentiu, na primeira meia hora.** Dois toques em "Salvar" viraram um `0` no campo
de rendimento, com o comando saindo zero das duas vezes: **o teclado é outra janela**, e a
árvore de acessibilidade do aplicativo não sabe que ele está por cima. O `dumpsys
input_method` sabe (`mInputShown`), e agora nada se toca sem fechar o teclado antes.

**A régua que fica:** o ambiente parado não é só uma condição para o aplicativo desenhar —
é a condição para ele ser **dirigível**. E toda leitura de tela precisa saber o que há
entre ela e o dedo.

---

## 10 de setembro — o SQLite do aparelho é a segunda fonte que faltava

**O que apareceu:** o emulador roda uma imagem `userdebug`, então `adb root` funciona e o
banco do aplicativo (`/data/data/app.norva.mobile/files/SQLite/norva.db`) abre com o
`sqlite3` que já vem no sistema.

**Por que importa:** até aqui, conferir um número da tela era refazer a conta na mão — o
que o `CLAUDE.md` exige, e que pega erro de aritmética. Não pega **erro de gravação**. A
tela dizia *"1.000 g · 100% do lote · R$ 12,40"* com a `recipe_lines` vazia; dizia
*"571 unidades de cada vez"* com `yield_per_unit` nulo; dizia *"12.000 g"* e gravava `ml`.
Nenhum dos três se vê refazendo a conta, porque a conta está certa — o que está errado é o
que sobra depois.

**A régua que fica:** onde a tela AFIRMA que guardou alguma coisa, a prova não é a tela
seguinte — é a linha no banco. Duas telas concordando podem estar lendo o mesmo rascunho
em memória.

---

## 10 de setembro — a unidade era do dono, e três frases decidiam por ele

**O que apareceu:** o dono perguntou se dá para escolher a unidade da receita. Dá — o
cadastro oferece mililitro, grama e unidade desde que existe, e grava a escolha certa.
Quem a desfazia eram as FRASES e uma linha de salvamento:

- `app/recipes/[id].tsx` gravava `yieldUnit: 'ml'` literal. Doze mil gramas voltavam do
  salvamento como doze mil mililitros.
- dois campos e a dica da perda diziam `ml` chumbado, com a ficha em grama na tela.
- a confirmação do produto dizia *"75 ml por unidade"*.
- a lista dizia *"por litro de massa"* — e o número por trás nunca foi um litro: é o custo
  de MIL unidades-base, que é um litro em ml, um quilo em g e mil unidades em un.

**A régua que fica, e ela tem duas metades porque uma varredura só não pegava as duas
formas:** medida colada num marcador (`'{{net}} ml de {{gross}}'`) é uma; frase inteira que
É a régua (`'por litro de massa'`) é outra, e a primeira varredura passou por ela sem ver.
As duas estão em `src/dictionary.test.ts`, cada uma com o caso que ela deve pegar e o caso
que ela não deve.

**E o pedido do dono já estava construído.** Isso é a terceira vez nesta semana que a
resposta para *"dá para fazer X?"* é *"X existe e alguma coisa depois o desfaz"*. O reflexo
certo diante de um pedido não é ir construir: é medir o que já existe.

---

## 10 de setembro — a leitura que falha desenha igual a um fato, e isso é a pior classe de defeito daqui

**O que apareceu:** ao ligar o estado de falha da capa eu escrevi que *"as outras 51 telas
continuam engolindo o erro"*. Era estimativa. Medido: **32 telas chamam `useQuery` e UMA
destrinchava o `error`.**

**Por que importa mais do que um erro comum:** neste aplicativo vazio é uma AFIRMAÇÃO.
"Não saiu nada hoje", "não há saldo", "não há ficha cadastrada" — as três dizem alguma
coisa sobre a fábrica de alguém, e uma consulta que quebrou produz exatamente a mesma
tela. O aplicativo inteiro existe para o número ser confiável; um defeito que não erra o
número e sim o FATO é pior que um que erra a conta, porque a conta errada alguém confere.

**O que mudou:** o casco por onde as 32 passam (`CollapsingHeader`) aprendeu a desenhar a
falha. A razão está escrita nele desde antes, sobre a entrada em cascata — *"fazer isso
tela por tela seria trinta arquivos e trinta chances de esquecer uma"* — e vale igual
aqui, com uma diferença que decidiu a forma: entrada é COMPORTAMENTO e mora só no casco;
o erro é DADO, e dado a tela precisa entregar. Então o casco desenha e uma guarda cobra a
entrega.

**A guarda entrou com dívida, e a dívida encolheu até zero na mesma rodada** — 31, 24, 18,
12, 5, 0. Isso é o oposto de guarda que espera o trabalho acabar para entrar: ela entrou
primeiro, com os nomes de fora escritos, e cada lote empurrou a lista para baixo com um
segundo teste recusando nome já pago.

**E o que sobrou não é dívida, é fronteira — a diferença me pegou no meio.** Liguei o
assistente junto com os outros cinco e o `typecheck` recusou por escopo. Fui ver por quê e
achei o docblock de `useCapacidades`: *"se este `useQuery` falhar, o assistente responde
menos em vez de responder o que não devia"*. Fechar por omissão ali é decisão, e uma
página de falha teria trocado uma tela que ainda serve por uma que não serve. A regra do
`CLAUDE.md` — *antes de chamar algo de defeito, procure a decisão* — foi cumprida pelo
compilador e não por mim.

---

## 10 de setembro — a tela que mostra o defeito nem sempre é a que o tem

**O que apareceu:** a capa de um aplicativo recém-instalado oferece *"Lançar a primeira
produção"*. O toque abre a tela de produção, que responde *"Nenhum produto tem ficha
técnica ainda. Cadastre a receita primeiro."* — explica o impedimento e **não oferece a
porta**. Eu tinha registrado isso como defeito da tela de produção.

**Era decisão, e estava escrita** três linhas acima do estado vazio: *"a saída aqui é a
receita, que se cadastra noutra tela e não se navega daqui: esta é uma tela empilhada, e o
caminho de volta é o de sempre"*. Navegação empilhada tem regra, e a regra é boa.

**O defeito estava um passo antes.** Quem errou foi a CAPA, ao sugerir a única coisa que
ainda não dava para fazer — com o sistema sabendo, porque a cadeia é fixa e ele conta os
elos: sem insumo não há ficha que custe alguma coisa, sem ficha não há produto, sem
produto não há corrida. Lei 1 inteira, do lado errado.

**A régua que fica:** quando um caminho termina em parede, a pergunta não é *"por que esta
tela não tem saída"* — é **quem me mandou aqui, e por quê**. A tela do fim costuma estar
certa em recusar; quem está errado é quem ofereceu a porta trancada.

---

## 10 de setembro — o conserto que eu li antes de o aparelho ler

**O que apareceu:** consertando o campo que perdia letras, escrevi uma régua com memória —
o campo ignora do pai qualquer valor que já tenha subido dele, porque o eco atrasado é
exatamente isso. Passou no `typecheck`, passou nos dois testes que escrevi junto, e estava
errada.

**O que ela engolia:** `setNome('')` depois de salvar. Um formulário que se esvazia manda
um valor que JÁ subiu do campo — e com um nome de oito letras ou menos ele ainda estava na
janela de memória. O campo continuaria mostrando o texto de antes com o pai achando que
limpou. Eu tinha trocado um defeito silencioso por outro.

**Como apareceu:** relendo o próprio conserto antes de compilar, perguntando de que outras
formas um valor legítimo do pai poderia parecer eco. Não foi teste, não foi o aparelho, não
foi o `mutate` — foi a pergunta.

**A régua que ficou não guarda nada:** com o dedo no campo, quem manda é quem digita; fora
dele, quem manda é o pai. Não há janela para acertar e não há comprimento que mude o
resultado. **Toda vez que uma regra precisa de uma JANELA para funcionar, vale perguntar o
que passa por ela indevidamente** — a resposta costuma existir e costuma ser um caso real.

---

## 10 de setembro — o defeito mora onde o produto mudou de forma, não onde o código é velho

**O que apareceu:** a caminhada de hoje fechou o caminho inteiro — insumo, ficha, produto,
produção, transferência, conferência, contagem e relatórios — e os defeitos não se
espalharam por igual. As telas construídas por ÚLTIMO (contagem cega, relatórios) não
tinham nenhum: a contagem esconde o número esperado *"senão a conferência vira cópia"*,
abre a conta por extenso, nomeia a consequência (*"5 un saíram da prateleira e entram como
venda"*) e ainda oferece a saída (*"Derreteu alguma parte? Lance a perda antes de contar"*).
As telas antigas concentraram tudo.

**E o que elas concentram tem uma forma só:** vocabulário que sobreviveu a uma mudança de
produto. `Insumos` contando três espécies em Ajustes e uma no Almoxarifado. A sobrancelha
`almoxarifado` sobre um picolé, porque a página de estoque passou a servir o que se vende.
A porta *"Lojas e clientes"* abrindo *"Estoque por lugar"*, porque a tabela ganhou veículo e
câmara fria depois do nome. E o `nav` inteiro da capa antiga — dezoito folhas nos três
idiomas — que morreu no dia em que o Mosaico nasceu e ficou.

**Por que importa:** a leitura fácil é *"código velho apodrece"*, e ela manda reescrever o
que é antigo. A leitura certa é outra: o código estava certo quando foi escrito, e o
PRODUTO mudou de forma por baixo dele. Onde uma tela passou a mostrar mais coisas do que
mostrava, ou uma tabela ganhou uma espécie, o nome ficou para trás — e nome errado não
quebra teste nenhum, porque cada frase, sozinha, continua bem escrita.

**O que mudou por causa disso:** a guarda de chaves passou a comparar CAMINHO com caminho
em vez do nome da folha (`src/dictionary.test.ts`), e uma guarda nova cobra que a linha do
"Mais" diga o nome da tela que ela abre. As duas medem exatamente a distância entre o que a
tela mostra e a palavra que sobrou — que é onde este tipo de defeito mora. A segunda achou
o item 27 sozinha, no commit em que nasceu.

---

## 10 de setembro — a régua tem de ser mais fina que o fenômeno, e as minhas não eram

**O que apareceu:** três medidas minhas erraram no mesmo dia, e eu tratei as três como
achados separados até ver que são a mesma coisa.

| a régua | o fenômeno | por que ela não pegava |
|---|---|---|
| `dd` de 300 MB dentro do aparelho | o emulador pede **7,37 GB** para criar a partição | media a grandeza errada |
| ler a árvore 6 s depois do intent | a navegação leva **até 63 s** ali | mais rápida que o fenômeno |
| `\.<folha>\b` em qualquer lugar do código | a chave é um **caminho**, não um nome | mais grossa que o fenômeno |

**Por que importa:** as três produziram afirmação, não silêncio. O disco "estava sobrando",
a rota "era ignorada", a chave "tinha leitor" — e as três afirmações eram confortáveis, o
que é o pior de tudo: nenhuma delas me fez desconfiar. Uma régua cega não devolve erro,
devolve o resultado que você esperava.

**E o custo é composto, porque medida errada vira registro.** A do disco virou uma linha na
tabela de hipóteses derrubadas do `docs/roadmap.md` e travou o emulador por horas. A da tela
virou um item de defeito que sobreviveu a **duas** conferências, porque cada repetição
confirmava o mesmo artefato. A do dicionário deixou passar uma frase que o `CLAUDE.md` usa
como exemplo de como o aplicativo deve falar.

**O que mudou por causa disso, e é o que separa isto de lamento:** `abrir`
(`scripts/aparelho.mjs`) não volta mais na hora — ele lê a tela antes, dispara, espera o
texto mudar e **falha** se não mudar; `folhasSemLeitor` (`src/dictionary.test.ts`) compara
caminho com caminho, com as cinco formas de leitura que este repositório usa; e a cicatriz
do disco no docblock do `subir` foi corrigida para dizer o que o emulador PEDE, não o que o
convidado consegue gravar.

**A pergunta que fica, e ela é barata:** antes de acreditar num número, *a minha régua é mais
fina que a coisa que ela mede?* Nas três, responder isso custava uma medição a mais e teria
poupado o dia. E a irmã dela, que este arquivo já exigia e eu cumpri tarde: **régua nova passa
num caso verdadeiro e num falso antes de dizer qualquer número** — foi conferindo uma amostra
à mão que eu descobri que a terceira régua estava prestes a apagar dezesseis chaves vivas.

## 10 de setembro — antes de trazer uma troca para o dono, veja se a escolha existe

**O que apareceu:** eu tinha uma troca redonda na mão e ia levá-la para ele decidir. O
`unstable_settings = { anchor: '(tabs)' }` conserta a volta de quem entra por ligação
profunda no APARELHO — medido, partida fria em `norva://losses`, o foco passando do launcher
para a capa — e **quebra a web** — medido com uma variável só, a tela montada como segundo
cartão da pilha, deslocada uma largura inteira (janela de 412 px, elemento em x = 607). Os
dois lados provados, os dois custosos: aparelho certo com a suíte do navegador vermelha, ou
web certa com o aplicativo expulsando quem entra por link. Escrevi o item no roadmap com a
medida de cada lado e a recomendação, que é a forma certa de fazer uma pergunta de dono.

**O que me fez parar:** o `CLAUDE.md` diz que a pergunta se faz em três casos, e o primeiro é
*"a resposta muda o que é construído"*. Isso é uma afirmação sobre o mundo, e afirmação se
confere. Fui checar se a escolha existia mesmo — e ela não existia. `app/who.tsx` e
`app/scan.tsx` **já** perguntavam `canGoBack()` antes de voltar, cada um com o seu destino, e
o `who.tsx` carrega até o registro de como aquilo foi achado: *"por leitura (E1), numa análise
de olhos novos"*. O padrão, a razão e a prova estavam aqui dentro o tempo todo.

**Por que importa:** a âncora era eu resolvendo com ferramenta pesada — uma opção global que
muda como a pilha inteira é montada — um problema que este repositório já resolvia com uma
pergunta de três palavras no lugar da chamada. A troca não era do produto: era do meu
instrumento. E ela ia consumir uma rodada do dono para escolher entre dois lados de um dilema
que não existe.

**E há um agravante que este arquivo já conhece por outro nome.** A regra da casa diz que
*"conserto de pele não termina no arquivo que o mostrou"*, e aqui a forma é a mesma virada do
avesso: **duas telas já tinham o conserto e as outras doze não**, porque cada uma resolveu por
conta própria e ninguém perguntou quem mais fazia aquilo. Solução que mora em duas telas não é
regra do aplicativo — é coincidência com dois exemplares.

**O que mudou por causa disso:** `src/nav.ts` exporta `voltar(destino = '/')`, extraído das
duas que já acertavam, e as **doze** saídas do aplicativo passaram a chamá-lo — as duas
originais incluídas, senão volta a divergir. A âncora saiu do `app/_layout.tsx`, e a checagem
`an invoice warns before it is committed` voltou a passar. `src/nav.test.ts` guarda as duas
metades: nenhuma tela chama `back()` cru (varrendo `app/` sem os comentários, senão acusaria o
docblock do `who.tsx` que explica o defeito) e a âncora não volta sem alguém medir a web
antes. As duas provadas plantando a quebra e vendo vermelho.

**E a guarda pegou o autor dela no mesmo dia.** Eu tinha escrito "catorze saídas" em quatro
lugares — o docblock, a guarda, o roadmap e este arquivo — e as saídas são **doze**. Os dois
sobrando eram `router.back()` citado em PROSA de docblock, contado como se fosse chamada: exatamente
o caso que o `semComentario` da guarda existe para separar, e que eu tinha acabado de provar
plantando quebra. A régua que eu escrevi para o código não estava valendo para mim: contei com
`grep` cru o que a guarda conta sem comentário. **Número publicado é afirmação, e afirmação se
mede com a mesma régua que se cobra do repositório.**

**A pergunta que fica:** quando uma decisão de dono se formar na minha cabeça, *o repositório
já respondeu isto em algum canto?* Custa um `grep` pelo comportamento — não pelo nome, que eu
não sabia — e neste caso ele devolveu a resposta com o docblock explicando por quê.

## 10 de setembro — a constante que estava certa numa largura era defeito na outra

**O que apareceu:** o dono achou no tablet dele um defeito que passou por 683 testes, 53
checagens de navegador, quatro sessões de emulador e por mim olhando o arquivo — *"a tela
fica tremendo muito rápido para cima e para baixo quando eu tento rolar"*.

A causa é um número: `RANGE = 72`, a faixa de rolagem em que o cabeçalho encolhe. O
cabeçalho é irmão da lista e os dois dividem a altura, então encolher um cresce o outro, a
borda de cima da lista sobe, e o dedo — parado no vidro — passa a estar mais embaixo DENTRO
da lista. O Android lê isso como rolagem para trás. É realimentação, e o que decide se ela
se acomoda ou oscila é `dAltura/dRolagem`.

| largura | cena | ganho |
|---|---|---|
| 360 dp | 64,9 dp | 2,17 |
| 393 dp | 71,4 dp | 2,32 |
| 800 dp | 112,4 dp | **3,27** |

**Por que importa, e é a parte que este arquivo já sabia por outro nome.** O `CLAUDE.md`
diz desde 5 de setembro que *"não existe o aparelho"* e que **nenhuma medida de tela é
pixel fixo**. A regra foi escrita sobre LARGURA — coluna que serve a 393 dp virando tira a
800. O 72 não é largura: é uma faixa de ROLAGEM, e por isso não parecia violar nada. Só que
ele é comparado com uma altura que cresce com a largura, e uma constante comparada com algo
que varia é a mesma doença noutra dimensão. **A regra não era sobre largura; era sobre
qualquer número fixo que entra numa conta com um número que a tela decide.**

E repare no que isso faz com o diagnóstico: o defeito **piora com o tamanho da tela**. No
emulador a 393 dp o ganho é 2,32 e treme; no tablet é 3,27 e treme muito. Quem só olha o
telefone lê "está um pouco lento".

**A correção veio dele, e ela trocou o diagnóstico.** Eu tinha escrito, com mecanismo e
tudo, que o tremor era o GRAMPEAMENTO do deslocamento máximo — o que só age perto do fim da
rolagem. Ele respondeu: *"parece q só nao aconteceu nas q o conteudo cabe na tela (na tela
de produção tb aconteceu)"*. Isso é incompatível com grampeamento, que precisa do fim, e
compatível com ganho, que age o tempo todo. Uma frase de observação derrubou uma explicação
que eu tinha construído inteira e que era plausível o suficiente para eu já ter mandado
para ele.

**O que mudou por causa disso:** a faixa saiu de constante e passou a ser calculada da
altura que se quer remover, com teto de ganho em 0,8 (`src/components/cabecalho.ts`, fora
do React para poder ser testada). `cabecalho.test.ts` cobra o teto em dez larguras e nas
duas peles, e mede a derivada **remontando as três rampas do jeito que a tela as desenha**
em vez de perguntar a mesma álgebra ao contrário — a regra desta casa sobre segunda fonte
independente, que eu quase quebrei: a primeira versão da guarda exportava um
`ganhoDoColapso` que era o `faixaDeColapso` invertido, e o portão P1 a pegou por outro
motivo (função exportada sem chamador), o que me obrigou a escrever a régua de verdade.

**A pergunta que fica:** *este número fixo entra numa conta com algum número que a tela
decide?* Onde a resposta for sim, ele não é constante — é defeito esperando a tela certa. E
a forma de achar os outros é mecânica: `grep` por constante numérica que aparece do mesmo
lado de uma conta com `useWindowDimensions`, `alturaDaCena`, `medida` ou `insets`.

## 10 de setembro — o portão P1 pergunta quem CHAMA, e devia perguntar quem ALCANÇA

**O que apareceu:** o dono disse *"o app está complicadíssimo de se usar… eu não consigo
fazer absolutamente nada"*, e depois descreveu a fábrica do pai dele em detalhe. Fui medir
cada peça da descrição contra o código, e o resultado foi o mesmo três vezes seguidas:

| o que ele precisa | banco | domínio | teste | TELA |
|---|---|---|---|---|
| receita usando outra receita (a calda base dentro do picolé) | desde a `0018` | `explodeRequirements`, recursivo, com trava de ciclo | sim | **não oferecia** |
| contar em caixa e engradado, com equivalência | `packaging.tiers` | `toBaseUnits`, `breakdown`, hierarquia de tamanho livre | sim | **não oferece** |
| família com dois degraus (pote vai direto para engradado) | aceita | aceita | aceita | **descartava calado** |

Três para três: **o motor estava pronto e os pedais não existiam.** E o pior caso é o
terceiro, porque ali a tela não só deixava de oferecer — ela recebia o número do dono e
jogava fora sem uma palavra, por causa de um `faixas.length > 1` que presumia que toda
família tem caixa no meio.

**Por que o portão não pegou.** O P1 deste projeto pergunta *"quem chama isto no mesmo
commit?"* e é uma boa pergunta — foi ela que matou o `assistant_phrase`, o `Draft.kind` e
as quatro seções de dicionário sem tela. Só que ela é satisfeita por **qualquer** chamador:
`explodeRequirements` é chamado por `costRecipe`, que é chamado pela tela da receita. A
cadeia existe inteira. O que não existe é um caminho em que uma PESSOA, tocando na tela,
consiga produzir a entrada que aquela capacidade consome. A função tem chamador e não tem
porta.

E isso não é um detalhe de redação da regra: é a diferença entre um teste verde e um dono
que não consegue cadastrar o primeiro produto da fábrica dele. A suíte tinha 689 casos e
todos passavam.

**O que mudou por causa disso:** a tela da receita passou a oferecer receitas como
ingrediente, com a trava de ciclo virando pergunta ANTES da escolha (`wouldCycle`); a
conta dos degraus saiu de dentro da tela para `tiersFromCounts` no domínio, com teste para
as duas formas reais da fábrica — três degraus no picolé (44 e 6 → 264) e dois no pote; e
a checagem de navegador passou a ANDAR o caminho dele: cria a ficha, usa a calda dentro
dela, e fica vermelha quando a oferta some.

**A pergunta que fica, e ela é o P1 corrigido:** *qual é a sequência de toques que produz
a entrada desta capacidade?* Se não dá para escrever a sequência, a capacidade não existe
para quem usa — por mais chamadores que ela tenha. E o jeito de responder não é ler o
código: é a checagem de navegador fazer os toques, que é o que separa "tem caminho" de
"eu consigo imaginar um caminho".

## 11 de setembro — a peça previa o chamador, e o chamador não vinha por um detalhe de gesto

**O que apareceu:** quarta vez no mesmo dia em que a capacidade existia e a tela não a
usava — e desta vez com um agravante que muda o diagnóstico. O `UnitStepper` conta em
unidade, caixa e engradado, e o docblock dele **nomeava a tela que faltava**:

> *"Production is the exception… the kettle put out 250 units, and the crates are the
> CONSEQUENCE, echoed underneath. So that screen starts on the base unit."*

A previsão estava escrita, com o `initialTierId` construído para servi-la. E o chamador
nunca veio. Nas três vezes anteriores a explicação era simples — ninguém tinha feito o
trabalho de tela. Aqui não: **a peça não servia**. O passo anda ±1 no degrau escolhido, e
250 unidades seriam 250 toques. Quem tentasse ligar teria desistido em dois minutos.

**Por que importa:** um docblock que promete um chamador futuro é uma dívida sem cobrador.
Ele parece o contrário de código morto — tem intenção escrita, tem parâmetro pronto — e é
pior, porque a intenção escrita **impede a pergunta**: quem lê "a produção vai usar isto"
para de se perguntar se a produção CONSEGUE usar. O parâmetro `initialTierId` existia há
semanas, sem um único chamador, e a suíte nunca reclamou porque ele é opcional.

E o defeito que isso escondeu não era de código, era de **gesto**: a peça foi desenhada
para a câmara fria (mão de luva, −18 °C, alvo grande, teclado é inimigo) e a produção
digita um número que acabou de contar. Duas ergonomias, uma peça, e ninguém tinha medido a
distância entre elas.

**O que mudou por causa disso:** o teclado entrou na peça existente, **opcional**
(`digitavel`), em vez de nascer uma segunda ao lado — a separação continua com o gesto
provado e a produção ganha o dela. O campo digitável carrega rótulo próprio, senão um
leitor de tela anunciaria "mais, campo de texto" no meio de uma contagem. E a checagem de
navegador passou a cobrar o ECO: 600 unidades dizem "2 engradados" antes de gravar.

**A pergunta que fica, e ela é barata:** quando um docblock prometer um chamador futuro,
*escreva a sequência de toques desse chamador agora*. Se ela não fecha — 250 toques, um
campo que não existe, uma tela que não tem o dado —, a promessa não é dívida técnica: é
uma peça que não serve, e dizer isso hoje custa uma linha. `grep` por docblock que cita
uma tela pelo nome sem que a tela importe o arquivo é uma régua possível.

## 11 de setembro — o conserto foi aplicado a um botão que não era o que quebrou

**O que apareceu:** o item 6 do roadmap — *"quem entra por link direto numa tela interna
não tem volta"* — estava fechado com `src/nav.ts`, doze saídas convertidas, uma checagem
de navegador nova e uma ressalva honesta escrita ao lado: *"a foto do aparelho com o foco
na capa foi tirada COM a âncora"*. Fui repetir a partida fria no aparelho para tirar a
ressalva. O foco foi para o launcher **outra vez**:

```
norva://losses  -> mCurrentFocus=app.norva.mobile/.MainActivity   (a tela de Perdas)
input keyevent 4 -> mCurrentFocus=com.android.fakesystemapp/...EmptyHomeActivity
```

E a causa não é o `canGoBack()` responder errado. É que **a tecla do aparelho nunca chega
ao `voltar()`**: ela é atendida pelo padrão da navegação, que numa pilha de um cartão
encerra a Activity. Não havia um `BackHandler` em lugar nenhum do projeto — `grep` por
`BackHandler|hardwareBackPress` devolvia zero linhas em `src/` e `app/`.

O `voltar()` atende a **seta do cabeçalho**. São duas entradas para o mesmo gesto, e o
trabalho inteiro serviu a que não estava quebrada.

**Por que aconteceu, e é uma palavra:** a medida do defeito diz *"um toque no voltar"*. O
conserto serve *"o voltar"*. A frase é a mesma para a tecla do aparelho e para a seta
desenhada na tela, então a prosa juntou duas coisas que o Android trata por caminhos
diferentes, e ninguém perguntou qual das duas. O docblock do `src/nav.ts` carrega a medida
feita com a tecla (`mCurrentFocus` passa para o launcher) como justificativa de um
conserto que mexe na seta — as duas metades escritas no mesmo parágrafo, sem ninguém notar
que eram duas.

**E o agravante muda a lição da sessão, não a repete.** Hoje mesmo escrevi aqui que
capacidade se prova com uma checagem de navegador que **anda o caminho tocando**, não com
teste de unidade. A checagem existe, ela toca, e ficou verde: **ela clica na seta**, porque
no navegador não existe tecla de aparelho. Então o corolário que faltava é este — *uma
checagem de navegador não prova gesto que o navegador não tem.* Ela não erra por
descuido; erra por estrutura, e por isso fica verde para sempre.

O que o navegador estruturalmente não alcança, escrito para ninguém fechar item com verde
de novo: a **tecla/gesto de voltar do Android**, a **partida a frio por intent**, a
**rotação**, o **diálogo de permissão do sistema** e a **volta do segundo plano depois de
o sistema matar o processo**. Cada uma dessas é caminho de quem usa, e nenhuma tem como
acontecer num `page.click`.

**O que mudou por causa disso:** `src/volta.ts` decide o que a tecla faz, fora do React e
com teste — e a decisão tem três casos, não um. O que ela protege de verdade é o caso do
meio: consertar com *"voltar sempre vai para a capa"* abriria a grade de nomes
(`app/who.tsx`, aberta por `replace` na abertura do aparelho compartilhado), e o
`app/_layout.tsx` recusa isso por escrito — com o piso de capacidades, chegar à capa sem
dizer quem é deixa operar sem nome. Um teste que só cobrisse o defeito aprovaria esse
conserto. A separação é por **procedência** (`Linking.getInitialURL()`), não por lista de
telas: as três telas que chegam sem pilha atrás são estruturalmente idênticas, e listar
nome envelhece no primeiro `replace` novo. O casco registra o ouvinte uma vez, e
`src/nav.ts` e `app/who.tsx` passaram a apontar para a outra metade da regra.

**E a régua nova pegou o próprio autor antes de reportar nada.** `porFora('https://norva.app/')`
respondia `true`: em `norva://losses` a rota vem na posição de **host**, e num `https://`
essa posição é o **domínio**. Lido com uma régua só, abrir o aplicativo pela raiz da web
contaria como ligação profunda e a pessoa ficaria presa na capa apertando voltar — *o
outro defeito, com a mesma cara de conserto*. Quem pegou foi o caso FALSO do teste, que
esta casa exige de todo detector novo, escrito na mesma hora que o verdadeiro.

**A pergunta que fica:** quando uma medida e um conserto usam a mesma palavra, *qual
entrada exatamente foi medida?* Aqui a palavra era "voltar" e as entradas eram duas. A
checagem barata é perguntar com que comando a medida foi tirada — `input keyevent 4` é a
tecla, `page.click` é a seta — e conferir se o conserto está no caminho daquele comando.

## 11 de setembro — o aviso do portão era verdadeiro e a conclusão dele era falsa

**O que apareceu:** fechando a rodada da tecla de voltar, o `.proofgate/verify.sh` passou
com sete avisos e eu despachei um deles assim: *"nenhum vem deste commit"*. É verdade, e
não é justificativa — o `CLAUDE.md` exige que todo ⚠️ ganhe uma por escrito. O aviso era:

> `superuser-verification: 6 added line(s) let a test/verification path connect to Postgres
> as a superuser. Superusers bypass RLS, so policies are NOT exercised — the run proves
> shape, not acceptance.`

E no mesmo minuto eu tinha escrito, no corpo do PR e na tabela *"medido, não afirmado"* do
plano: **"29 garantias contra Postgres, sob RLS"**. As duas frases não podem ser
verdadeiras juntas.

**Medido, uma a uma:** o script conecta como dono do banco e troca para `app_user`
(`as_user`) só onde imita o cliente. **Quinze** trocam. **Quatorze** não.

**E a conclusão do aviso está errada para as quatorze** — o que é o achado, e por pouco eu
não o via porque a primeira régua que escrevi concordava com o aviso. Ela marcou oito
"afirmam política e rodam como dono", e as duas primeiras que fui ler eram falso positivo:

- a **29** diz *"nunca na empresa vizinha"*, que soa a RLS, e o mecanismo está escrito no
  próprio bloco — **chave estrangeira composta**. Restrição prende superusuário;
- a **17** fala de política o tempo todo e **lê `pg_policies` do catálogo**, comparando com
  o SQL que a fila gera. É metadado, não acesso — e ali o dono do banco é necessário.

Das quatorze, doze citam no próprio texto o mecanismo que as prende: gatilho, restrição,
índice único, chave, catálogo. **Rodar essas como dono é mais forte, não mais fraco.** É a
diferença entre provar **aceitação** (o servidor deixa esta conta escrever isto?) e provar
**impossibilidade** (nem o dono do banco quebra isto), e a segunda é a que o razão precisa
— este repositório já mediu que `DELETE` em `movements` é recusado **até para o dono**.

**Por que importa:** é a mesma doença da tecla de voltar, do outro lado. Lá, um conserto
foi aplicado à entrada errada porque a palavra servia as duas. Aqui, uma frase de resumo
cobriu duas provas diferentes com o nome da mais fraca. Nos dois casos o erro não está no
que o instrumento faz — está na **frase sobre o que ele prova**, e frase de resumo é
exatamente o que envelhece sem reprovar nada.

**O que mudou por causa disso:** a tabela do plano passou a dizer os dois números e o que
cada metade prova. `src/bar.test.ts` ganhou uma guarda que DERIVA a divisão do script e
reprova se a tabela não a disser — provada vermelha na frase antiga antes de a frase ser
corrigida, e com a auto-checagem que este repositório exige de régua heurística: se o
padrão passar a casar com tudo ou com nada, uma das contagens zera e a guarda reprova em
vez de produzir um número que não existe. Conferida nos dois sentidos: a checagem 4 (*"one
company cannot see another"*) cai em "sob RLS", a 17 e a 29 caem em "forma".

E a seção do dossiê que repetia a tabela do plano deixou de repeti-la: ela dizia **338**
testes quando o sistema tinha **711**, e **13** garantias quando tinha **29**. A guarda
confere o plano contra o código; ninguém confere uma cópia da tabela dentro de outro
documento — a cópia é a única das três que pode mentir sem reprovar nada.

**A pergunta que fica:** quando um ⚠️ do portão for despachado com *"não é meu"*, isso
responde de **quem** é a linha, nunca se a **afirmação** dele vale. Aqui a linha não era
minha e a frase era — e a frase é o que o dono lê.

## 11 de setembro — a guarda dizia "iguais" tendo lido nenhuma, e isso estava escrito

**O que apareceu:** terceira vez no mesmo dia que o defeito é uma FRASE sobre o que um
instrumento prova, e desta a frase era a saída do próprio instrumento.

`mesmaTelaEmTodas` existe para pegar "a rota não pegou numa das cinco larguras" — a falha
em que trocar `wm size` recria a Activity, o app volta para a capa, e as cinco fotos saem
da tela inicial com o comando saindo zero. Ela era quatro linhas:

```js
titulos.push(parou.diz[0] ?? '');                      // leitura falhada vira ''
const vistos = [...new Set(titulos.filter(Boolean))];  // e o '' é descartado
return { igual: vistos.length <= 1 };                  // cinco vazios => "iguais"
```

Com o movimento de ambiente ligado — que é o estado **normal** deste aplicativo — o
`uiautomator` responde `could not get idle state`, o `try/catch` devolve lista vazia, e as
cinco leituras viram `''`. O conjunto fica vazio, `[].length <= 1` é verdadeiro, e o
comando anuncia *"as cinco são a mesma tela"* **tendo lido nenhuma**.

**E o que torna isto diferente dos outros dois achados de hoje: estava escrito.** O
`CLAUDE.md` descrevia a cegueira em voz alta — *"a guarda não pode falhar, que é
exatamente o defeito que este arquivo proíbe duas seções abaixo"* — e parava ali,
instruindo *"confira olhando as cinco"*. Uma fronteira dita em voz alta, que este mesmo
arquivo já proíbe em outro parágrafo: *"se a promessa é boa, feche o buraco; se não é,
corrija a promessa. Não existe terceira saída."* A terceira saída foi tomada mesmo assim,
e durou dois dias.

**Por que ela pareceu razoável:** o buraco foi lido como *bloqueado* — ler a tela com
movimento depende do orçamento de movimento, que é decisão do dono — e quem lê "bloqueado"
para de procurar. Só que o bloqueio vale para **ler**, não para **responder**. A diferença
entre *"são iguais"* e *"não consegui olhar"* não depende de decisão nenhuma, e é ela que
separa uma guarda de um carimbo.

**O que mudou por causa disso:** o veredito tem três respostas (`scripts/leitura.mjs`,
extraído para poder ser exercitado — script não tinha teste nenhum neste repositório).
`nao-sei` sai como aviso alto dizendo **quantas das cinco** foram lidas, e não derruba o
comando: as fotos são o que se veio buscar e elas saíram. `diferentes` continua derrubando.

E a resposta do meio é a que faz a correção valer, não as duas pontas: **quatro larguras
lidas e iguais, com uma ilegível, é `nao-sei`** — a ilegível pode ser justamente a que não
navegou, e é para ela que a guarda existe. A simetria não vale: duas lidas e DIFERENTES já
derrubam, porque diferença achada é fato e ausência de diferença entre duas de cinco não é.

**A pergunta que fica:** quando um buraco for registrado como bloqueado, separe o que está
bloqueado do que só estava junto. Aqui o bloqueio era do sensor e a mentira era do
relatório — e o relatório sempre dá para consertar hoje.

## 11 de setembro — a guarda tinha teste, e o teste afirmava o defeito

**O que apareceu:** consertada a guarda das cinco larguras, fui ver o que MAIS tocava
nela — a regra desta casa de que conserto não termina no arquivo que o mostrou. E o que
tocava era um autoteste, dentro do próprio `aparelho.mjs`, com este comentário por cima:

> *"A régua descartável também passa por um caso verdadeiro e um falso — este projeto já
> teve duas medidas de uma vez erradas por não fazer isso."*

Quatro casos. O último era:

```js
[[], true],   // nenhuma leitura => "as cinco são a mesma tela"
```

**O teste afirmava a mentira como esperado.** Ele passava verde todas as vezes, e o verde
era a prova de que ninguém tinha perguntado o que aquele caso queria dizer. Um `docs/insights.md`
de 10 de setembro chegou a registrar que *"a régua dessa recusa tem autoteste com caso
verdadeiro e caso falso… promessa boa, buraco fechado"* — e o buraco não estava fechado,
estava **carimbado**.

**Por que importa mais que o defeito que ele escondia:** este repositório tem uma regra
forte e muito citada — *detector novo não reporta nada antes de passar num caso verdadeiro
e num falso*. Ela é boa e é **contável**, e por isso vira ritual: dois casos, pronto. O que
ela não obriga ninguém a fazer é ler o que cada caso AFIRMA. Aqui a forma estava perfeita e
o conteúdo era o defeito, escrito em oito caracteres.

É irmã da regra que já está no `CLAUDE.md` sobre `assert.ok(valor > 0)` e sobre a segunda
fonte derivada da primeira: nas três, a linha **parece** uma verificação. A diferença é que
ali o problema é a asserção não morder; aqui ela morde com força na direção errada.

**O que mudou por causa disso:** o autoteste foi **removido**, não corrigido — a régua
mora em `scripts/leitura.mjs` e quem a exercita é `src/leitura.test.ts`, com sete casos,
rodando no `npm test` em vez de num verbo que ninguém digita. Duas fontes para uma verdade
é o defeito de sempre, e a que ficou é a que a CI roda. O parágrafo de 10 de setembro
ganhou a correção em cima, com o caso citado, para não continuar afirmando um buraco
fechado.

**A pergunta que fica, e ela troca uma contagem por uma leitura:** diante de um caso de
teste, não pergunte *"tem caso verdadeiro e falso?"* — pergunte **"o que este caso diz que
deve acontecer, e é isso mesmo?"**. `[[], true]` responde em uma linha, para quem olhar.

## 11 de setembro — o achado estava escrito, e por isso ninguém foi buscá-lo

**O que apareceu:** consertada a guarda das cinco larguras para dizer *"não consegui
olhar"* em vez de *"são iguais"*, sobrou a pergunta que eu tinha dado como travada: por
que não dá para LER? A resposta estava no `docs/insights.md`, escrita em **10 de
setembro**, um dia antes:

> *"Depois dos consertos do ambiente ele continuou recusando — mas com
> `transition_animation_scale 0`, que é o que o aplicativo lê como 'reduzir movimento',
> ele lê a tela inteira em segundos."*

`grep` por `transition_animation_scale` no repositório inteiro: **uma ocorrência**. Essa.
Em prosa. Não estava em `scripts/aparelho.mjs`, não estava no `CLAUDE.md`, não estava em
roteiro nenhum — e o `CLAUDE.md` continuava dizendo, a toda sessão que o lesse, que a
conferência automática *"não existe"* e que só o orçamento de movimento a destravaria.

**Medido antes de ligar, porque a noite inteira foi sobre isso** — uma variável, a mesma
tela, a mesma sessão:

| movimento | leituras da tela |
|---|---|
| desligado | **3 de 3**, 13–14 s cada |
| ligado | **0 de 3**, desistindo em 21–23 s |

As duas afirmações estavam certas e nunca tinham sido postas lado a lado: o `CLAUDE.md`
acertava que com movimento não se lê, o `insights.md` acertava que sem movimento se lê, e
faltava alguém somar as duas.

**Por que importa:** a diretriz desta casa diz que *todo insight vira uma linha no
`docs/insights.md`*, e que *achado sem consequência não entra*. A linha foi escrita. A
regra foi cumprida na letra — e o achado continuou não acontecendo por um dia, porque o
conteúdo dele não era uma lição: era uma **técnica**. Lição muda o que a próxima sessão
pensa, e para isso um parágrafo basta. Técnica muda o que a ferramenta FAZ, e um parágrafo
não faz nada: quem vai usá-la precisa tropeçar nela, e ninguém tropeça num arquivo de
9.400 linhas.

Pior: o registro escrito *parece* consequência. Ele fecha a sensação de dívida — o achado
está guardado, está documentado — e é exatamente por isso que ninguém volta.

**O que mudou por causa disso:** `fotos <nome> <rota>` desliga o movimento de propósito,
lê, confere e devolve (`semMovimento`, com `finally` — porque desligar sem devolver é o
defeito que envenenou este emulador por um dia). O `foto` singular não mexe em nada: é o
verbo de *"como esta tela está"*, e para isso o aplicativo tem de estar vivo. Duas réguas
em `src/leitura.test.ts` prendem as metades que sozinhas não valem nada — desligar sem
devolver, e devolver sem desligar. E o `CLAUDE.md` deixou de dizer que a conferência é
impossível.

**A pergunta que fica, e ela corrige a diretriz sem enfraquecê-la:** quando escrever um
insight, pergunte **de que tipo é o conteúdo**. Se é uma lição, o arquivo certo é este. Se
é uma técnica — um comando, uma bandeira, um jeito de fazer a máquina responder —, o
arquivo certo é a **ferramenta**, e este aqui só registra que ela mudou. Insight cujo
único vestígio é a própria entrada não teve consequência: teve anotação.

## 11 de setembro — o restauro falhou calado, e eu não sei por quê

**O que apareceu:** escrevi um `semMovimento` que desliga o movimento do aparelho para
poder ler a tela e devolve num `finally`, com o docblock inteiro explicando que *"quem
troca, devolve"* — a cicatriz do `wm density`. Rodei o comando de verdade. Ele morreu na
terceira largura, e as três escalas ficaram **em zero**: o restauro não aconteceu.

**O que eu sei, medido:**

- o padrão `try { ... } finally { restaura }` roda e devolve certo — testado em isolamento,
  com uma `fn` que rejeita, no mesmo aparelho e com o mesmo comando `adb`;
- `process.exit()` não existe no caminho do `fotos` (só no verbo `ler` e no uso desconhecido);
- os dois envoltórios de `adb` são `execFileSync` puro — nenhum engole erro;
- `wm size` e `wm density` FORAM devolvidos na mesma queda ("tela de volta ao natural").

**O que eu não sei:** por que não devolveu. Ou `antes` já era zero quando o comando
começou, ou alguma coisa saiu sem passar pelo `finally`. As duas explicações cabem no que
eu observei, e escolher uma agora seria inventar.

**Por que isso é o achado, e não o bug:** eu escrevi um restauro e não escrevi como saber
se ele aconteceu. Ele não imprimia nada, não conferia nada, e o sucesso dele era
indistinguível do fracasso — exatamente a forma de defeito que esta noite inteira tratou,
uma camada acima: a guarda que respondia "iguais" sem ler, a frase que dizia "sob RLS" para
provas que não passam por RLS, o autoteste que afirmava a mentira. Aqui fui eu, no mesmo
dia, escrevendo a quarta.

E tem um agravante próprio: **um restauro é a única operação cujo sucesso ninguém vai
verificar por conta própria.** Quem roda o comando olha a foto, não o estado do aparelho —
e o estado errado só cobra na PRÓXIMA sessão, que é quando ninguém mais liga uma coisa à
outra. Foi assim que este emulador passou um dia inteiro fotografando o aplicativo parado.

**O que mudou por causa disso:** o restauro lê de volta o que escreveu e compara. Quando
bate, diz o que devolveu numa linha. Quando não bate, **grita** com o valor que devia estar
e o comando para devolver na mão. A próxima execução responde a pergunta que esta não
respondeu — e se ela responder "devolvi certo", então `antes` já era zero, e o defeito é
outro.

**A pergunta que fica:** ao escrever qualquer coisa que DESFAZ (restaurar, limpar, fechar,
estornar), pergunte como alguém saberia que não aconteceu. Se a resposta for "olhando o
estado depois, em outra sessão", o desfazer precisa falar. Silêncio é a ausência de
notícia, e num desfazer a ausência de notícia é indistinguível do sucesso.

## 11 de setembro — a foto preta não era da câmera, e a hipótese bonita estava errada

**O que apareceu:** o `fotos` produz imagens pretas. Minha hipótese era limpa e encaixava:
a foto que funcionou hoje saiu **sem** troca de largura, e as cinco pretas todas **depois**
de `wm size` — logo, o override de largura quebra a composição.

Medido com uma variável só, mesma tela, duas capturas:

| condição | captura | quadros desenhados |
|---|---|---|
| resolução natural | **morta** | 0 |
| com `wm size` + `wm density` | **morta** | 0 |

A hipótese caiu. E o furo do meu primeiro experimento apareceu junto: eu tinha comparado só
a captura do CONVIDADO nas duas condições, quando quem produz imagem de verdade às vezes é
o console do emulador. Fechada a outra metade: o console também volta morto.

**O que o `logcat` respondeu, e é outra coisa:**

```
V/WindowManager: Orientation start waiting for draw, mDrawState=DRAW_PENDING  (repetido)
I/WindowManager: Screen frozen for +3s401ms ... +2s905ms
I/app.norva.mobile: NativeAlloc GC freed 154416 (5722KB) ... total 2.985s
I/app.norva.mobile: ... freed 80265 objects ...   (a cada ~450 ms)
```

O aplicativo **não completa um desenho**, e está coletando lixo sem parar: ~80 mil objetos
a cada meio segundo, parado numa tela. A foto preta é sintoma, não doença — e o `Total
frames rendered: 0` estava disponível o tempo todo, escrito na própria mensagem de erro da
ferramenta (*"Confira se o app desenhou"*), que eu li três vezes hoje sem seguir.

**O que NÃO está estabelecido, e fica dito:** a causa da coleta. O candidato óbvio é o
movimento de ambiente, e ele **não fecha** — a execução do `fotos` rodou com o movimento
desligado e as fotos saíram pretas igual. Pode ser o emulador por software; pode ser o
aplicativo alocando demais. Escolher agora seria repetir o erro que esta entrada registra.

**Por que importa mais do que a ferramenta:** oitenta mil objetos por meio segundo numa
tela parada não é feitio de emulador, é feitio de código. Num tablet de verdade isso é
bateria e engasgo — e liga direto no orçamento de movimento que já está na mesa do dono,
que até agora era uma pergunta de 1.574 ms contra 158 ms numa tela, medida no navegador.
Este número é de outra natureza: não é o custo de abrir, é o custo de **ficar aberto**.

**A pergunta que fica:** quando a hipótese for elegante — *"a foto quebrou depois de X,
logo é X"* —, a primeira coisa a medir é o caso SEM X. Custa uma execução, e aqui ela
derrubou a explicação inteira antes de eu construir um conserto em cima dela. E quando a
ferramenta disser na mensagem de erro o que conferir, confira isso primeiro: o
`Total frames rendered: 0` teria começado a investigação onde ela terminou.

## 11 de setembro — a ferramenta que prova que verde não basta relatava mais do que media

**O que apareceu:** o `mutate` fechou a virada com *"1 defeito(s) atravessaram a suíte
inteira"*. Fui procurar qual teste estava fraco. Nenhum estava: **a mutação não chegou a ser
plantada.** O trecho do `from` — `(unitPackaging.itemsRate ?? 0) +` — passou a casar com
duas linhas de `src/domain/recipe.ts`, e a ferramenta recusa aplicar quando é ambíguo, com
razão, porque pegaria só a primeira.

O relatório somava **quatro estados** num contador chamado `survivors`:

| estado | o que aconteceu | de quem é o serviço |
|---|---|---|
| `obsoleta` | o trecho mudou, não foi plantada | do arquivo de mutações |
| `ambigua` | o trecho casa N vezes, não foi plantada | do arquivo de mutações |
| `inconclusivo` | a execução não fechou | da máquina |
| passou despercebido | **foi plantada e a suíte ficou verde** | dos testes |

Falhar está certo nos quatro — guarda que não roda não guarda. A **frase** é que estava
errada, e ela não é detalhe de estilo: ela manda a pessoa para o lugar errado. Quem lê
"atravessou a suíte" vai ler teste; o serviço era consertar uma âncora de três linhas.

**Por que isto é o achado e não o bug:** é a sexta vez na mesma noite que a afirmação é mais
larga que a medida — e a mais irônica das seis. O `mutate` existe exatamente para provar que
*"verde não quer dizer protegido"*, e o relatório dele afirmava proteção medida onde não
houve medida nenhuma. A ferramenta do ceticismo com o mesmo defeito que ela caça.

E ele durou porque o número dessa linha **não é derivado de nada**: a tabela do plano dizia
*"125 plantados, 123 pegos, 2 equivalentes, 0 sobreviventes"*, e só o 125 sai do arquivo. O
resto era prosa escrita uma vez. O `0 sobreviventes` já estava falso.

**O que mudou por causa disso:** dois contadores e duas frases, porque são duas notícias —
*"atravessou a suíte"* fala dos testes, *"não foi medida"* fala do arquivo de mutações e diz
que a regra daquela mutação está SEM guarda até alguém mexer. A linha do plano passou a
trazer só o número derivado, com o resultado embaixo e **com data**.

E a âncora ambígua abriu um buraco de verdade junto: o trecho ficou ambíguo porque nasceu um
SEGUNDO caminho com a mesma forma — `packCost` —, e ele não tinha mutação nenhuma. Não é
caminho qualquer: é o que sustenta a doutrina desta casa de arredondar uma vez só, porque
ele multiplica antes de virar centavo. Errar a ordem ali perde um quinto antes da primeira
multiplicação, e num engradado de 264 picolés isso chega na cotação. Ganhou mutação própria.

**A pergunta que fica:** quando um relatório somar estados diferentes num contador, pergunte
**para onde a frase manda quem a lê**. Um número certo com uma frase que aponta para o lado
errado custa mais que um número errado — porque ele parece acionável, e a pessoa age.

## 11 de setembro — o defeito chegou à tela, foi consertado, virou parágrafo, e a regra ficou sem ninguém

**O que apareceu:** consertada a ferramenta de mutação, a primeira execução com a mutação
nova devolveu **um sobrevivente de verdade** — e era a que eu tinha acabado de escrever.
Embrulhar a soma de `costPerPack` em `cents(...)` antes de multiplicar por `unitsPerPack`
passou por **730 testes verdes**.

O docblock da função conta o defeito inteiro, com números:

> *"um picolé de 7,3265 centavos vira 7. Multiplicar esse 7 por cinquenta dá R$ 3,50 onde a
> conta é R$ 3,66 — quatro e meio por cento de margem evaporados no número que o dono usa
> para dar preço de caixa. Foi assim que a tela de cadastro de produto mostrou 'Caixa
> fechada: R$ 3,50' para uma caixa de R$ 3,66."*

Então a sequência foi: o defeito **aconteceu**, chegou à tela do dono, foi **consertado**, e
o conserto virou **parágrafo**. Um chamador (`app/products/new.tsx:316`), zero testes.

**Por que isso é diferente de código sem teste:** um trecho qualquer sem teste é dívida
conhecida. Aqui existe uma função criada **especificamente** para impedir um erro que já
custou caro, com a história escrita por cima — e é justamente esse parágrafo que fecha a
pergunta. Quem lê o arquivo vê a explicação, entende o porquê, e não pergunta *"e o que
impede isto de voltar?"*. **O docblock ocupa o lugar da guarda sem fazer o trabalho dela.**

É a irmã de uma regra que este repositório já tem — *"comentário que se declara único não é
o mesmo que ser único"* —, e a diferença é o sujeito: lá o comentário AFIRMA uma propriedade
que não é verdade; aqui ele NARRA um conserto que é verdade, e o leitor conclui sozinho que
está protegido.

E o custo aqui multiplica, o que torna o caminho pior que a média: errar a ordem de
arredondamento numa unidade é um centavo; numa caixa de cinquenta é `50 × o erro`; num
engradado de 264, é o que aparece na cotação.

**O que mudou por causa disso:** `costPerPack` ganhou guarda, com os números do defeito de
verdade copiados do docblock e comparados contra a conta feita à mão — não contra nada
derivado da função, que seria verdadeiro para qualquer ordem de arredondamento. Cobre também
a embalagem da unidade: meio centavo de palito por picolé é vinte e cinco centavos numa
caixa de cinquenta, e some inteiro se cada picolé arredondar sozinho. Provada mordendo: com
o defeito plantado à mão ela reprova, com a árvore limpa ela passa.

**A pergunta que fica, e ela é barata:** quando um docblock contar um defeito que já
aconteceu, `grep` pelo teste que o prende. Se não houver, o conserto está apoiado em quem
leu o parágrafo — e parágrafo não roda na CI. A busca é de dez segundos e o que ela acha é
sempre o mesmo tipo de coisa: a regra mais bem explicada do arquivo, sem ninguém atrás.

## 11 de setembro — a garantia do nível NOVO auditou a promessa VELHA, e ela era falsa há três semanas

**O que apareceu:** escrevendo a garantia 30 do `db:verify` para provar a decisão do dono
de que *"o produto nao necessariamente requeira todas as subclasses"*, a primeira inserção
de um produto com PRODUTO preenchido e TIPO vazio devolveu:

```
ERROR:  insert or update on table "products" violates foreign key constraint
        "product_type_belongs_to_its_line"
DETAIL: MATCH FULL does not allow mixing of null and nonnull key values.
```

A `0018` afirma, **no mesmo arquivo que cria essa restrição**:

> *"Os três níveis são OPCIONAIS, e isso é a fundação do 'depende vira dado': uma fábrica
> que faz um doce só não deve ser obrigada a inventar uma linha e um tipo para cadastrá-lo.
> **Quem tem um nível só preenche um nível só.**"*

E `match full` torna isso impossível: ele exige o par inteiro ou inteiramente nulo, então
`(linha = X, tipo = nulo)` — que é literalmente "um nível só" — é recusado pelo banco.

**O arquivo se contradiz, em prosa e em SQL, e ninguém viu por três semanas.**

**Por que ninguém viu, e é a parte que transfere:** nenhum teste jamais inseriu um produto
classificado só pelo nível de cima. Não por descuido — por **falta de motivo**. Quem
escreve teste de produto cadastra um produto completo, porque é o caso que a tela produz.
A combinação que quebrava era a que ninguém tinha razão para tentar.

Foi preciso um NÍVEL NOVO para alguém ter motivo. A garantia 30 existe para provar que a
categoria é opcional, e para isso ela precisa inserir combinações incompletas de propósito
— e ao fazer isso auditou de graça uma promessa de três semanas atrás.

**A lição, então, não é sobre `match full`:** é que **a prova de uma capacidade nova é a
auditoria mais barata das promessas antigas**, porque ela exercita combinações que o
código existente nunca teve razão para produzir. Uma suíte madura testa o que o produto
faz; ela não testa o que o produto *permite*. A diferença só aparece quando alguém amplia
o que é permitido.

E o raciocínio da `0018` estava **meio certo**, o que é o que o tornou invisível. Ela queria
impedir `(linha = nulo, tipo = Y)` — um tipo pendurado em nada, que `match simple` deixaria
passar. Isso é um perigo real. O que ela não viu é que `match full` paga esse preço
proibindo junto o caso comum. Erro de meia-verdade não parece erro: parece rigor.

**O que mudou por causa disso:** a `0058` separa as duas regras, cada uma com a ferramenta
certa — a CHAVE (em `match simple`) prova que o par existe quando os dois estão
preenchidos, que é a única hora em que há o que provar; o CHECK diz a direção, "nível de
baixo exige o de cima, nunca o contrário". E a garantia 30 fica cobrando as duas.

**A pergunta que fica:** ao construir um nível, um campo ou um estado NOVO, escreva a prova
dele com as combinações INCOMPLETAS de propósito — e quando uma falhar, leia se o que
falhou é a coisa nova ou uma promessa velha que ninguém tinha exercitado. Aqui foi a
segunda, e ela custava a fundação inteira do "depende vira dado".

---

## "Trinta garantias verdes" era uma frase, não um resultado — 11 de setembro

Eu reportei ao dono, no fim da rodada anterior, que `npm run db:verify` passava com **30
garantias**. Rodando-o hoje, ele morre na checagem **6**:

```
Error: a sessão não exercita product_categories — a checagem 6 cobriria menos do que promete
```

E a data em que passou a morrer é a do commit em que eu disse que estava verde: a `0057`
criou `product_categories`, o serializador passou a declarar que sabe enviá-la, e a sessão
do aparelho (`scripts/device-session.ts`) nunca escreveu uma. **O guard que pega isso
existia e estava funcionando** — ele é literalmente a frase "a sessão não exercita X". O
que faltou foi eu ler a saída do comando que eu estava citando.

Medido antes de afirmar, e é uma dedução de dois fatos conferíveis: `device-session.ts` não
foi tocado por mim nesta sessão (`git diff HEAD --name-only`), e no commit `4fed9c9` ele já
tinha zero chamadas a `saveCategory` enquanto `serialize.ts` ganhava `product_categories`.

**Por que importa mais que o defeito:** este repositório inteiro é construído contra "a
afirmação mais larga que a medida". Verde de navegador não prova gesto, foto não prova
vida, `> 0` não prova soma. Todas essas regras protegem contra medir a coisa errada. **Esta
é outra classe: eu não medi.** Nenhuma régua pega isso, porque a régua estava certa e
vermelha — o que falhou foi o relato.

**O que mudou por causa disso:**

1. A sessão do aparelho passou a cadastrar categoria e a estreitar a variação nela, então
   a checagem 6 cobre a cadeia inteira contra o Postgres de verdade.
2. Atrás do primeiro defeito havia um segundo, que só apareceu depois de o primeiro ser
   consertado: `permission denied for table product_categories`. A lista de `grant` do
   `verify-migrations.sh` é escrita **à mão** e não tinha o nome — a cicatriz de 7 de
   setembro (*"sem o grant a fila inteira é recusada por permissão"*), inteira, pela
   terceira vez. Ela agora tem guarda: `src/sync/grants.test.ts` deriva de `serialize.ts`
   (TypeScript) e confere contra o script de shell — **duas mãos diferentes**, que é a
   condição para a guarda guardar alguma coisa.
3. A guarda achou um terceiro caso e **eu o li errado**: `readings` é append-only e tem
   `update`. Tirei o privilégio, reescrevi a checagem — e o `db:verify` respondeu
   `permission denied for table readings`, porque o `update` existe para a sonda provar que
   a **POLÍTICA** recusa a reescrita. Sem o privilégio, o que reprova é a permissão, que é a
   prova mais fraca e não diz nada sobre a política. A regra do `CLAUDE.md` vale para
   achado de guarda igual: *"antes de chamar algo de defeito, procure a decisão"* — e a
   decisão estava no bloco de baixo do arquivo que eu estava editando.

**A pergunta que fica:** quando você for dizer o resultado de um comando, o comando rodou
nesta rodada? Não "rodou uma vez", não "deve estar igual": rodou, e você leu a última linha.
Comando que não rodou não tem resultado — tem expectativa, e expectativa dita como número é
a mesma doença com outro rosto.

---

## O caminho alternativo não precisa ser confiável: ele precisa ser INCAPAZ — 11 de setembro

O dono pediu dois caminhos para registrar a mesma produção, e deu a invariante junto:
*"ambos valendo desde que o resultado seja o mesmo"*. A leitura óbvia disso é um teste:
registra pelos dois lados, compara os dois livros-razão, movimento por movimento.

Esse teste é fraco, e vale dizer por quê: ele prova **os exemplos que alguém escreveu**. Um
caminho alternativo com gravação própria tem tantas maneiras de divergir quantas combinações
de produto, ficha, embalagem e sala existirem — e a que ninguém escreveu é justamente a que
vai aparecer na fábrica.

O que a rodada fez foi outra coisa: **tirar do caminho alternativo a capacidade de gravar.**
`app/fiz.tsx` coleta a frase, mostra a escada e encaminha; quem escreve no razão continua
sendo a mesma `app/production/new.tsx` chamando a mesma `recordProduction`. Aí a invariante
deixa de ser uma propriedade a verificar e passa a ser uma consequência da forma: **não
existe caminho para dois razões diferentes**, então não há o que comparar.

E o que sobra para a guarda é pequeno e forte, duas linhas de texto (`src/caminho.test.ts`):
nenhuma chamada de gravação em `fiz.tsx`, e as quatro portas dos dois caminhos iguais degrau
por degrau — porque mandar a pessoa a outra tela de cadastro coletaria outro dado, e o razão
divergiria sem ninguém escrever uma linha de gravação.

**A pergunta que fica, e ela é maior que este caminho:** quando aparecer um segundo jeito de
fazer a mesma coisa — um atalho, um assistente, uma importação, uma tela nova para gente
apressada —, a pergunta não é *"ele faz certo?"*. É **"ele tem como fazer errado?"**. Se
tiver, a resposta certa quase nunca é mais teste: é tirar a capacidade e deixar um caminho
só chegando ao livro.

*Nota de honestidade sobre a guarda:* ela é régua de TEXTO e não executa nada, então não
pega uma gravação por um caminho indireto que ela não saiba nomear. O que ela pega é o que
de fato acontece quando uma tela cresce — alguém acrescenta o `saveX` ali porque era mais
curto. Isso está escrito no topo dela, e não na minha cabeça.
## A oficina se recusou a reportar, e isso é a régua que a minha cicatriz não tinha — 11 de setembro

O `CLAUDE.md` tem escrito, desde 9 de setembro, que o `mutate` é a última coisa da rodada:
*"as três mediram uma árvore que eu já tinha mudado — então o resultado chegou velho e as
âncoras vieram cegas"*. Regra escrita, lida por mim nesta sessão, e eu a quebrei de novo:
disparei a execução e **dois minutos depois editei o `docs/roadmap.md`** para acertar o
número de mutações.

O que aconteceu foi melhor que a regra. A oficina roda a suíte UMA VEZ sem mutação nenhuma
antes de começar, e parou tudo:

```
A oficina não roda a suíte: 1 falha(s) SEM mutação nenhuma.
Enquanto isso for verdade, todo defeito plantado é declarado "pego" sem a
suíte ter sido consultada — que é o pior relatório possível: verde por construção.
```

A falha era `bar.test.ts` na cópia: `scripts/mutate.mjs` já dizia 130 mutações e o
`docs/roadmap.md` da cópia ainda dizia 126. Sem essa checagem, **as 130 teriam sido
declaradas "pegas"** — porque a suíte falha de qualquer jeito, com ou sem mutação, e um
relatório que só sabe distinguir "falhou" de "passou" leria isso como "a suíte pegou".

**Por que isto importa mais que a regra de ordem:** a regra depende de eu lembrar. Esta
checagem não. E ela é a forma geral de um defeito que este repositório persegue sob outro
nome — a guarda que não pode falhar. `mesmaTelaEmTodas([])` respondendo "iguais" era a mesma
coisa: um detector cujo silêncio parece aprovação. Aqui o análogo seria uma suíte cujo
vermelho parece detecção.

**O que mudou por causa disso:** nada no código, e é por isso que ele entra aqui. A régua já
existia e funcionou. O que entra é a leitura dela: **todo medidor que compara dois estados
precisa saber que o estado de partida é o que ele acha que é.** O `mutate` mede "quebrado
contra são"; se o são já estiver quebrado, ele mede nada e diz tudo.

**A pergunta que fica:** o seu detector consegue distinguir "achei" de "não consegui
olhar"? Se as duas saídas dele são iguais, ele não é detector — é um gerador de verde.

---

## O emulador não estava lento: ele estava morrendo, a cada quatro minutos — 11 de setembro

O item aberto desde ontem era *"o `fotos` não produz imagem neste emulador, causa não
estabelecida"*, com uma hipótese derrubada (o `wm size`) e sintomas sem dono: `DRAW_PENDING`
repetido, `Screen frozen for +3s`, ~80 mil objetos coletados por meio segundo com a tela
parada.

Fui instalar o APK desta rodada e a causa apareceu inteira, em três linhas do `logcat`:

```
ANR of com.android.networkstack.process in 17621ms, latency 76340ms
  -> Process com.android.networkstack.process has died: pers PER
  -> FATAL EXCEPTION IN SYSTEM PROCESS: IllegalStateException: Lost network stack
```

Um processo **persistente** do sistema levou 76 segundos para responder; o Android o matou
por ANR; e o `system_server` se mata de propósito quando perde o módulo de rede. Às 16:23:50,
16:28:33 e 16:32:12 — **três de três**, de quatro em quatro minutos, com 9 GB livres no
hospedeiro.

**Por que ninguém tinha visto:** cada sintoma isolado tem uma explicação plausível e errada.
Quadro preto parece ferramenta de foto quebrada. `DRAW_PENDING` parece GPU por software. A
coleta de lixo contínua parece vazamento do aplicativo. E `sys.boot_completed` respondendo
`1` **com zero serviços registrados** parece paradoxo — é o que é: a propriedade sobrevive à
morte do `system_server` que a escreveu.

Três sintomas, três hipóteses razoáveis, uma causa só. O que os une não está em nenhum
deles: está no buffer `crash`, que nenhuma das investigações anteriores leu.

**A pergunta que fica:** quando houver três sintomas sem dono no mesmo ambiente, a hipótese
mais provável não é três defeitos — é um, num andar mais baixo do que qualquer um deles.
Antes de explicar o sintoma, pergunte o que está morrendo. `logcat -b crash` é uma linha de
comando e responde isso.

*E o que mudou por causa disso, além do registro: a prova de tela neste container passou a ser
o NAVEGADOR — duas checagens novas dirigem `app/fiz.tsx` de verdade (monta, aceita a frase,
mostra a escada certa), que é mais do que uma foto provaria e não depende de um sistema que
não termina de nascer. E o `subir` ganhou a capacidade de falhar, que é o assunto do commit
ao lado.*

---

## O achado já estava na lista, fechado, e o padrão do script não tinha mudado — 11 de setembro

**Primeiro a correção, porque ela é o achado maior.** Eu escrevi que a imagem ATD era um
*"contorno não tentado"*, gastei uma compilação, um boot e uma instalação medindo-a, e o
**item 26 do `docs/roadmap.md` já estava fechado desde 10 de setembro** dizendo *"a imagem
`aosp_atd` instala de primeira"*, com oito hipóteses derrubadas ao lado.

O que faltava não era a medida: era a **consequência**. `scripts/aparelho.mjs` continuou com
`norva-cheio` no padrão, então toda sessão seguinte voltava a bater no AVD que não instala. É
literalmente a frase que o `CLAUDE.md` usa para outro caso — *"achado sem consequência é
achado que não aconteceu"* — e ela se aplicou a um achado do dia anterior, com a régua certa e
o conserto não feito.

A regra que sai disso e que eu violei duas vezes hoje: **antes de investigar um ambiente,
`grep` na lista pelo sintoma.** Eu fiz isso para código (é o portão "meça a afirmação do item
contra o código") e não para ferramenta. Custou uma compilação de cinco minutos e dois boots.

E o que a medida de hoje acrescentou de verdade, como repetição independente:

| | `norva-cheio` | `norva-atd` |
|---|---|---|
| boot | 396 s | 233 s |
| quedas do `system_server` | 3 em 9 min | **0 em 20 min** |
| `adb install` de 29 MB | recusado | **Success, 164 s** |

E na mesma execução a hipótese IMPLÍCITA caiu: eu estava tratando o quadro preto como
consequência da queda. Num sistema sem uma única queda, o aplicativo sobe, a `MainActivity`
fica em primeiro plano, o `SurfaceFlinger` aloca a camada dele em `1080 x 2340, 9871 KiB`, e
**`Total frames rendered` continua 0.**

**Por que isso é ganho e não decepção:** a caçada deixou de ter um suspeito e passou a ter uma
lista de inocentes provados — a troca de largura, o "reduzir movimento", a queda do sistema, e
a superfície ausente. Quatro eliminações medidas valem mais que uma hipótese nova, porque
eliminação não envelhece: ela continua verdadeira na próxima sessão, e a hipótese não.

**E uma terceira afirmação larga, esta herdada e não minha:** o item 26 diz *"o aplicativo
instala, abre e **desenha**"*, e a prova ao lado é a árvore de acessibilidade — que prova que
o React montou, não que um quadro foi para a tela. A medida de hoje separa as duas no mesmo
AVD: monta (buffer alocado em 1080x2340, `MainActivity` em primeiro plano) e **não desenha**
(`Total frames rendered: 0`). As duas são compatíveis; a palavra era mais larga que a régua.
Corrigida no item.

**A pergunta que fica, e ela é sobre método:** ao testar um contorno, escreva o que ele
resolveria E o que ele deixaria de pé. Eu escrevi só a primeira metade, e por isso o
resultado parcial chegou como surpresa em vez de como medida — a instalação funcionando e o
quadro continuando preto eram duas respostas diferentes que eu tinha empacotado numa.

*E uma ironia que se paga escrever: o rastro da partida do ATD, que teria a linha do
renderizador escolhido, foi apagado por mim — a segunda partida truncou o arquivo de nome
fixo, que é exatamente o defeito que eu consertei uma hora depois. A prova morreu pela coisa
que o conserto existe para impedir.*

---

## O quadro preto acabou sendo sobre o INSTRUMENTO, e a prova de tela mudou de ferramenta — 11 de setembro

A caçada do quadro preto fechou, e o candidato que parecia óbvio desde o começo caiu. Mesmo
AVD, mesmo APK, mesma rota, `am force-stop` entre as condições porque `vida.ts` guarda a
resposta de reduzir-movimento uma vez por sessão:

| | `transition` | `window` | `animator` | quadros |
|---|---|---|---|---|
| tudo ligado | 1 | 1 | 1 | **0** |
| só o APP parado | 0 | 1 | 1 | **0** |
| tudo parado | 0 | 0 | 0 | **0** |

**O movimento não é a causa.** E o que a mesma sessão mostrou fecha o assunto por outro
caminho: a **árvore de acessibilidade lê a tela inteira e certa** — `COMECE PELO FIM`,
`O que você fez?`, `O QUE SAIU`, `Continuar` —, a captura do convidado devolve um **PNG
válido de 1080×2340**, e o conteúdo dele é **uma cor só, preto**.

Ou seja: nesta imagem o aplicativo **monta e nunca é rasterizado**. A captura não está
quebrada; a rasterização não acontece. `aosp_atd` é imagem de instrumentação.

**O que isso corrige, e é mais que um item:** este repositório tinha a regra *"o que prova
tela é a foto do emulador, olhada"* — escrita por um bom motivo, depois de um tema claro
ilegível chegar ao dono. Mas no ambiente de hoje essa regra é **inexequível**, e uma regra
inexequível não é rigor: é a porta pela qual "não deu para provar" vira "está provado".

A regra que a substitui não é mais fraca, é mais honesta, e tem duas metades:

- **o que a árvore prova**, e é bastante: layout, texto, idioma, dado, navegação por ligação
  profunda. Foi assim que `app/fiz.tsx` ficou provado num Android de verdade nesta rodada;
- **o que ela não alcança**: composição, cor e movimento. Isso não tem instrumento aqui — é o
  aparelho do dono, e não se finge o contrário.

E a consequência virou código em vez de parágrafo: quando o quadro sai morto, `foto` agora
diz que no ATD isso é o estado normal e aponta para `ler`. Sem isso, a próxima sessão
gastaria a mesma compilação redescobrindo a mesma coisa — que é exatamente o que aconteceu
hoje com a imagem ATD, achada ontem e sem consequência no padrão do script.

**A pergunta que fica:** quando uma prova não sai, a primeira pergunta não é "o que está
quebrado no que eu estou medindo?" — é **"o meu instrumento mede isto aqui?"**. Três sintomas
sem dono e uma tabela de três condições custaram menos que uma hipótese nova, porque a
pergunta certa era sobre a régua.

---

## A fila tinha um item FANTASMA, aberto, de uma coisa já feita — 11 de setembro

Peguei a próxima da lista, item 29 (*"a guarda de chaves do dicionário casa pelo NOME da
folha"*), e fui medir a afirmação dele contra o código antes de construir. Ela estava
**fechada desde o dia anterior**: `folhasSemLeitor` compara caminho com caminho, e as cinco
chaves mortas que o item nomeia não existem mais — conferido perguntando ao dicionário pelos
cinco caminhos exatos, e os cinco responderam `NAO EXISTE`.

O item estava na lista **duas vezes**: a versão fechada, escrita por cima, e o texto original
quarenta linhas abaixo, aberto. E não era só ele — 29, 30 e 31 apareciam em dobro na mesma
seção, as duas cópias de 30 e 31 byte-a-byte idênticas.

**Por que isto é pior que documentação velha:** a fila é a **entrada de um laço automático** —
*"nunca ocioso: pegue a próxima da lista escrita"*. Um item fantasma aberto não confunde um
leitor humano, que vê a versão fechada logo acima; ele manda **reconstruir o que existe**, que
é exatamente a doença de sete rodadas que `src/plano.test.ts` inteiro existe para curar. E ela
voltou por um caminho que nenhuma guarda de medida alcançava: o marcador do item fechado
estava certo, e o fantasma simplesmente **não tinha marcador** — a guarda de "todo item
carrega uma medida" não pergunta se o NÚMERO já foi usado.

**O que mudou:** as cópias saíram, e `plano.test.ts` ganhou a guarda que recusa item repetido
por seção, provada nos dois sentidos (com o fantasma devolvido, ela fica vermelha).

**E uma segunda coisa saiu da mesma leitura:** o item 10 esperava *"a foto"* para decidir se a
última linha de Mais é corte ou rolagem. Prova de imagem não existe neste container, então ele
esperava para sempre. O instrumento que responde é a árvore, que traz `bounds` de cada nó —
dois comandos e nenhum pixel. O item passou a dizer isso.

**A pergunta que fica:** guarda que confere o CONTEÚDO de cada item não pergunta se a LISTA é
bem-formada. Duas entradas com o mesmo número, uma seção sem título, um item fora de ordem —
nada disso é conteúdo errado, e tudo isso muda o que o laço lê. Antes de confiar numa lista
como entrada de automação, guarde a forma dela, não só o que ela afirma.

---

## O instrumento que não lê devolve "tela vazia", e tela vazia parece defeito — 11 de setembro

O último item aberto da fila de agora dizia, desde 9 de setembro: *"o ambiente satura a
thread de UI e **o aplicativo passa a renderizar errado**"*, com evidência ao lado — *"a capa
esvazia, o Almoxarifado vem sem a lista, os cartões vêm pálidos, a rolagem morre e o
`uiautomator` não lê a tela"*.

Cinco observações, e a quinta é a chave: **o instrumento das quatro primeiras é o mesmo que a
quinta diz que não funciona.** Um `uiautomator` que não lê devolve árvore vazia, e árvore
vazia se parece exatamente com "a capa esvazia".

Remedido com uma variável por vez, no ATD, mesma rota:

| movimento do app | o que a leitura devolve |
|---|---|
| ligado | intermitente — 1 de 3, e a que passou tinha 7 nós e **zero texto**; três leituras tardias escreveram **arquivo vazio** |
| desligado | completa e certa, com os números e as frases da tela |

E o que decide contra a interpretação antiga: **com o movimento LIGADO o aplicativo navega**.
`abrir inputs` viu a tela mudar em até 69 s com as escalas em 1 — foi para a tela certa; o que
falhou depois foi a leitura. Mais: o navegador dirige o aplicativo inteiro com as animações
ligadas, 58 de 58.

**Por que isto passou dois dias de pé:** a frase não é falsa por descuido, é *não-medida por
construção*. Quem escreveu tinha quatro observações consistentes entre si — e elas seriam
consistentes de qualquer jeito, porque vinham todas do mesmo instrumento cego. Consistência
entre leituras do mesmo aparelho quebrado não é confirmação; é a mesma leitura repetida.

**O que mudou:** o item passou a dizer o que sobra (o movimento custa caro e dirigir/ler sob
ele é pouco confiável — isso continua inteiro) e o que cai (*"renderiza errado"*, que fica
**sem medida**, esperando o tablet do dono, porque aqui não há instrumento que veja pixel).

**A pergunta que fica:** quando um item listar várias evidências, pergunte quantos
INSTRUMENTOS existem ali dentro. Quatro observações e um instrumento é uma observação. E se
uma das evidências for "o instrumento falhou", ela não é mais um sintoma na lista — ela é a
explicação das outras, e devia ser lida primeiro.

---

## Três itens travados, três réguas erradas — e nenhum deles estava travado por trabalho

Em uma noite, três itens da fila foram destravados sem que uma linha de aplicativo mudasse
por causa deles. Nos três, o que travava era o **instrumento**, escolhido uma vez e herdado
sem pergunta:

| item | o que dizia travar | o que travava de verdade |
|---|---|---|
| 26 — o emulador não instala | oito hipóteses derrubadas, causa glacial | **já estava resolvido** (imagem ATD, fechado no dia anterior) e o padrão do script nunca mudou |
| 10 — a última linha fica sob a barra | *"esperando a foto"* | a foto **não existe** aqui; a árvore responde melhor, e respondeu: 360 px de folga |
| 4 — o app renderiza errado sob saturação | cinco evidências | **quatro delas vieram do instrumento que a quinta diz que falha** |

Três formas diferentes do mesmo erro, e vale separá-las porque se parecem:

1. **A régua certa existia e não virou padrão.** Achado sem consequência — o repositório já
   tem essa frase escrita para outro caso, e ela se aplicou a um achado de vinte e quatro
   horas antes.
2. **A régua nomeada não existe mais.** O item esperava um instrumento que o ambiente deixou
   de ter, e esperar por ele é esperar para sempre. Ninguém reabre um item para perguntar se
   a prova que ele pede ainda é possível.
3. **A régua cega foi lida como sintoma.** A mais cara das três: o instrumento que não lê
   devolve vazio, vazio parece defeito, e a repetição confirma — porque é a mesma leitura
   repetida, não uma segunda opinião.

**O que isso muda no método, e é uma pergunta a mais no portão de pegar um item da fila.**
O projeto já manda *"meça a afirmação do item contra o código"*, e essa regra nasceu de
reconstruir seis coisas que já existiam. Ela pergunta pelo ALVO. Falta perguntar pela RÉGUA:

- a prova que este item pede ainda é possível neste ambiente?
- e quantos instrumentos existem por trás das evidências dele — porque quatro observações do
  mesmo instrumento cego são **uma** observação, e ela pode ser falsa.

*E a consequência já está no código e não só aqui: `foto` diz que o quadro morto é o estado
normal do ATD e manda usar `ler`; `subir` tem o ATD como padrão; e o item 4 carrega agora um
marcador `espera o tablet do dono` em vez de afirmar um defeito que ninguém viu.*

---

## 11 de setembro — a régua de frase é cega exatamente onde a tela FALA

**O achado.** A guarda `no screen writes a sentence of its own` exige, para chamar um
literal de frase, **espaço e palavra funcional** (`de`, `no`, `para`, `que`…). As três
condições estão certas e cada uma nasceu de um alarme falso real — sem elas a guarda
acusaria `'flex-start'` e o nome de toda constante.

Só que isso a cega para uma classe inteira de texto, e é a classe que mais precisa de
tradução: **o rótulo de acessibilidade**, que costuma ser uma palavra só. O caso concreto
estava de pé no `WhatsNew`: `accessibilityLabel="Fechar"` no fundo que fecha a folha — a
única saída que o leitor de tela anuncia ali. Um operador de baixa visão com o aplicativo
em espanhol ouvia "Fechar". A chave existia nos três idiomas, a duas portas, usada pela
folha irmã (`WhySheet`) para o mesmo gesto.

**Por que importa.** A fundação de i18n diz *"nenhuma tela guarda uma palavra"*, e a
guarda que a defende media "parece frase". Palavra única não parece frase, então a
fundação valia para o texto que se LÊ e não para o que se OUVE — e quem depende do que se
ouve é justamente quem não pode conferir olhando.

**O que mudou.** `src/layers.test.ts` ganhou uma régua sem "parece": literal em
`accessibilityLabel` ou `accessibilityHint` é sempre defeito, porque as duas propriedades
existem para ser lidas em voz alta. `accessibilityHint` entra sem violação nenhuma hoje,
por uma palavra a mais no padrão. E `screenLayers()` passou a incluir `src/config`, porque
as três frases do aviso de "Novidades" moravam **uma pasta ao lado** de quem as desenhava.

### E a metade do método, que é o achado maior: a prova vazia

Para fechar isto eu tinha de mostrar a guarda mordendo. Ela ficou **verde duas vezes** e as
duas eu quase escrevi como "a régua não morde":

1. A primeira injeção usou `str.replace` num alvo que não existia — o tipo `Release` é
   multilinha, o `replace` não achou nada e devolveu o arquivo intacto. O comando saiu 0.
2. A segunda injetou de verdade uma frase minha — *"Agora a conferência mostra as duas
   leituras."* — que **não contém nenhuma** das dez palavras funcionais da régua. Verde
   correto, sobre um caso que não é o caso.

Só a terceira, com a frase real que morava no arquivo e com `grep` confirmando a injeção
**antes** de ler o resultado, deu vermelho.

O projeto já exige *"detector novo não reporta nada antes de passar num caso verdadeiro e
num falso"*. Faltava a linha de baixo, e ela é onde eu escorreguei: **o caso verdadeiro
tem de ser confirmado no disco, não no comando que tentou escrevê-lo.** Injetor que falha
em silêncio produz um verde indistinguível do verde de uma guarda que funciona — e a
conclusão errada é a pior das duas, porque ela manda mexer numa régua que estava certa.

**E a terceira coisa, achada pela própria prova:** a guarda apontava `WhatsNew.tsx:52`
para um defeito que estava na **68**. `code()` apaga o bloco `/* … */` inteiro, e com ele
as quebras de linha de dentro — um docblock de dezesseis linhas somia antes da contagem.
Quem só procura no texto não se importa; quem diz ONDE, sim. Agora existe
`semComentarioContandoLinhas`, que troca o corpo do comentário por vazio e mantém as
quebras, com as duas direções provadas no próprio arquivo: a linha 68 acusada, e a 65 —
que contém o mesmo texto, dentro do comentário que EXPLICA a cicatriz — em paz.

---

## 11 de setembro — "FEITO" respondia a pergunta errada do portão P1

**O achado.** `movements.operator_id` tinha **sete escritores e zero leitores** do dia 6 ao
dia 11. Os sete `INSERT INTO movements` carimbam a coluna, `app/who.tsx` pergunta quem está
com o aparelho, o PIN atribui, `src/layers.test.ts` reprova o oitavo `INSERT` que não gravar
— e nenhuma consulta do aplicativo lia a coluna de volta. O item do plano estava riscado
como **FEITO**.

**Por que passou.** O item se chamava *"o operador no movimento"*, e a medida ao lado dele
provava exatamente isso: o movimento carrega o operador. A pergunta do portão P1 é outra —
**quem chama isto no mesmo commit** — e para uma coluna ela se lê *quem LÊ*. A única leitora
era `src/sync/serialize.ts`, que manda a coluna para o servidor: ou seja, o dado existia para
o servidor e não para a pessoa.

**O que torna isto defeito e não escolha registrada.** A frase está na tela do dono, nos três
idiomas: *"Desligado, o relatório fala de onde — 'faltaram 3 caixas na conferência'. Ligado,
o aparelho pergunta quem está com ele e cada linha guarda o nome."* Ligar a chave fazia o
aparelho perguntar, a grade abrir, o PIN atribuir e o razão gravar — e o relatório continuava
falando só de onde. **A pergunta era feita para ninguém**, e quem a responde é o operador de
luva, a cada turno.

**O que mudou.** `ExtractAct.operatorName`, com a chave da empresa entrando na consulta do
mesmo jeito que as duas do dinheiro — com ela desligada o nome não sai do banco, em vez de
sair e a tela não desenhar. `app/extrato.tsx` escreve `por {{nome}}` com preposição, porque
o nome cru depois do lugar (*"Conferência — Câmara fria · Ana"*) lê como acusação e a casa
proíbe culpar pessoa. O item do roadmap deixou de dizer só FEITO.

### As duas coisas que a construção ensinou, e nenhuma era o plano

**A primeira: o teste de navegador não cabia onde eu o pus, e a falha era o sistema
acertando.** Eu tinha posto o sentido inverso — desligar a chave e conferir que o extrato
cala — logo depois da asserção do nome, com a Ana ainda com o aparelho. Reprovou com
`getByLabel('Nomear quem gravou')` estourando trinta segundos. Não era defeito: quem não tem
`manage_company` **não vê os cartões da empresa**, por decisão de 9 de setembro. A chave não
estava na tela para ser desligada. O lugar do bloco é depois de largar o aparelho — e ali ele
prova de graça uma terceira coisa que eu não ia testar: **largar não apaga o que ela fez.** O
turno acaba, o registro não, que é a razão de a coluna existir.

**A segunda: um acento grave dentro de um template literal fecha a string.** O comentário SQL
que eu escrevi dentro da consulta dizia `` `LEFT`, e a empresa ainda pode ter apagado a
pessoa`` — e o `tsc` acusou `',' expected` numa linha de comentário, quarenta linhas abaixo do
que eu havia editado. Prosa com marcação de Markdown dentro de SQL dentro de JavaScript tem
um caractere proibido, e não é nenhum dos que se pensa.

---

## 11 de setembro — o aplicativo escrevia a resposta e reperguntava na semana seguinte

**O achado.** `purchases.supplier_name` e `purchase_lines.purchase_quantity` tinham escritor
e nenhum leitor. O nome do fornecedor é digitado a cada nota; a contagem de pacotes é `not
null` desde a `0002`. A única leitora das duas era `src/sync/serialize.ts`, que as manda para
o servidor — ou seja, o dado existia para o servidor e não para a pessoa.

E do outro lado da mesma tela: `app/purchase.tsx` abria com `useState('')` no fornecedor e
`useState('1')` na quantidade. A **Lei 1** proíbe pedir o que o sistema pode deduzir e a
**Lei 2** proíbe campo vazio, e as duas estavam furadas pelo dado do próprio aplicativo.

**Por que importa mais do que parece.** O custo não é o toque. Numa fábrica o mesmo insumo
vem do mesmo fornecedor quase sempre, e digitar "Distribuidora Aurora" de luva, no celular,
toda semana, é o atrito que faz **a nota não ser lançada** — e nota não lançada é a média de
custo errada embaixo de todo número de dinheiro do aplicativo daí para frente. Este arquivo
já diz a mesma coisa sobre beleza (*"aplicativo feio na câmara fria é pulado"*); a versão
dela em formulário é campo que nasce vazio tendo resposta.

**O que mudou.** `lastPurchaseOf` devolve o nome e a contagem da última nota daquele insumo —
e **não** o total, de propósito: o total é o número que decide preço e mora atrás de
`canSeeMoney` em `itemHistory`. Devolvê-lo aqui abriria uma segunda porta para o mesmo
dinheiro sem portão, que é um defeito que a ficha do insumo já teve. A tela semeia os dois
campos **uma vez por insumo** (`ref`), e mostra *"Da última nota. Troque se mudou."* enquanto
o valor ainda é o sugerido — porque *"o sistema sugere, nunca decide calado"*, e campo
preenchido sem dizer de onde veio é decidir calado.

### O efeito de lado que vale mais que o conserto

O plano já documentava, desde 8 de setembro, uma armadilha nas compras inteligentes:
agrupar prazo de entrega por NOME digitado faz *"Distribuidora Silva"* e *"distribuidora
silva"* serem dois fornecedores, cada um com metade das entregas, e o prazo sai pela metade
sendo plausível. Sugerir a string exata da última nota **não resolve** as grafias que já
existem, mas para de fabricar novas: quem aceita a sugestão repete o que já está no banco em
vez de digitar uma variante. O conserto de ergonomia entrou como conserto de dado.

### E a régua que faltava na ferramenta, não no código

Duas edições desta rodada falharam em silêncio por um motivo novo: **o bloco que eu queria
trocar aparecia duas vezes no arquivo.** `e2e/flow.mjs` tem duas checagens que lançam a mesma
nota da mesma polpa com as mesmas quatro linhas, e `str.replace` de um trecho ambíguo ou erra
o alvo ou acerta o errado. O `assert s.count(a)==1` pegou — mas só porque eu o escrevi;
`sed -i` na mesma situação teria editado as duas e saído 0.

É a irmã exata da regra que este mesmo dia acrescentou ao `CLAUDE.md` (*"o caso verdadeiro se
confere no disco"*): **a ferramenta de edição também precisa provar que editou UM lugar, e o
lugar certo.** Ancorar no que é único — aqui, a linha do `check(` acima — custa uma linha e é
a diferença entre um commit e um commit que mexeu numa checagem que eu não estava olhando.

### E o achado maior desta fatia: o navegador é CEGO para `??` virar `||`

A checagem de navegador que eu escrevi para prender *"apagar o fornecedor sugerido fica
apagado"* **passou com o defeito plantado**. Troquei o `??` por `||` — que é exatamente o que
faz a sugestão voltar por cima do campo vazio — e ela continuou verde.

A causa é do `input` controlado: com `||`, o valor que o React calcula depois de apagar é o
MESMO de antes ('Distribuidora Aurora'), então ele não repõe o texto que o Playwright tirou
da caixa. React compara propriedade com propriedade, não propriedade com o DOM.

**No aparelho não é assim, e este repositório já sabia.** O docblock de
`src/components/campo.ts` conta a mesma armadilha vista do outro lado, com números medidos:
o `TextInput` do Android repõe o texto nativo quando o valor derivado difere da caixa, e
dezessete letras digitadas viraram "Picole de moran". Ou seja: **o defeito que o navegador
não vê é o que chega ao dedo de quem usa.**

Isso amplia a lista do `CLAUDE.md` sobre o que o navegador estruturalmente não alcança —
que hoje fala de gesto (tecla de voltar, partida a frio, rotação, permissão do sistema). O
item novo não é gesto: é **campo controlado cujo valor derivado não muda**. A régua saiu da
tela para `campo.ts` e as cinco respostas viraram teste puro, onde a troca reprova na hora.

E a consequência de método, que vale para toda checagem de navegador daqui para frente:
**plantar o defeito que a asserção NOMEIA, não um parecido.** Uma asserção que sobrevive ao
próprio defeito não é fraca — ela é uma promessa falsa, e promessa falsa em teste é pior que
teste ausente, porque alguém vai confiar nela para mexer no código que ela cobre.

---

## 11 de setembro — uma nota que some no arredondamento travaria a fila para sempre

**O achado.** `purchaseToBaseUnits` faz `Math.round(quantidade × fator)`, e `app/purchase.tsx`
exigia **pacote** maior que zero — nunca **unidade-base** maior que zero. Num item comprado na
própria unidade-base, ou com um fator pequeno, digitar `0,4` dá **zero**. E `recordPurchase` não
tinha guarda nenhuma, quando as três irmãs têm: *"uma perda de nada não é uma perda"*, *"uma
transferência move alguma coisa"*, *"uma corrida roda a receita pelo menos uma vez"*.

**Por que importa, e não é a linha errada.** O Postgres tem as quatro recusas que o SQLite do
aparelho não tem — `purchase_quantity > 0`, `base_units > 0`, `total_cents >= 0` (`0002`) e
`movement_moved_something` (`0008`/`0017`). Todas voltam como `23514`, e `classeDaRecusa` trata
`23514` como **passageira de propósito**, com a razão escrita no docblock: um CHECK novo pode
recusar hoje o que uma migração seguinte aceita, e promovê-lo seria aceitar perda de dado por
palpite. Então a fila tentaria de novo **para sempre**, com tudo o que o aparelho gravasse depois
preso atrás — o defeito mais caro que este projeto conhece, e o `mutate` desta mesma noite o
nomeia numa mutação pega: *"a fila volta a travar exatamente onde este conserto existe para
destravar"*.

**Por isso o conserto é na ORIGEM e não no classificador.** Promover `23514` trocaria uma fila
travada por dado perdido. A nota de nada simplesmente não nasce: a camada de dados recusa as
quatro condições com a frase que a casa usa, e a tela deixa o botão inerte **e diz o que fazer**
(*"Aumente a quantidade: isso dá menos de 1 g e some no arredondamento"*) — impedir calado é o
outro extremo da Lei 5.

### A varredura, com os dois resultados ditos como são

Isto saiu de perguntar o que a linha *"o que o aparelho grava contra o que o servidor aceitaria"*
manda perguntar. Duas ramificações fecharam **sem achado**, e isso é resposta:

- **Nenhum outro caminho de escrita produz movimento de quantidade zero.** `moveBetween`,
  `recordLoss` e `recordProduction` guardam; `recordCount` grava `adjustment`, que a `0008`
  isenta de propósito (*"uma contagem que fechou é um fato"*); `recordCheck` grava
  `post = 'checked'` chumbado, que é exatamente a exceção que a `0017` abriu.
- **Nenhuma coluna `not null` do servidor fica sem valor.** `recorded_by` não está no `take` de
  `movements`, e por desenho: `build: (_row, actor) => ({ recorded_by: actor.userId })` a carimba
  no envio.

### E a checagem de navegador passou com o conserto REMOVIDO — a segunda vez na mesma noite

Escrita na ordem errada, ela enchia a quantidade **antes** do total. Sem a nota digitada o
rascunho já é nulo e o botão já está desabilitado, então ela media *"falta o total"* acreditando
medir *"some no arredondamento"*. Trocar a ordem — total primeiro — conserta, e aí a única coisa
que pode desabilitar o botão é a quantidade.

É a mesma lição da fatia anterior, e ela aparece com dois rostos diferentes em uma noite: lá a
asserção não distinguia `??` de `||`; aqui ela não distinguia dois motivos para o mesmo botão
cinza. A regra do `CLAUDE.md` — **plante o defeito que a asserção NOMEIA** — pegou as duas, e é
por isso que ela vale mais que a asserção.

---

## 11 de setembro — o terceiro fato de uma corrente morava DENTRO da guarda que a protegia

**O achado.** Três fatos ligam a `0051` à fila do aparelho, e a segurança de não travar a fila
depende dos três:

1. a migração escolhe `errcode = 'unique_violation'`;
2. o Postgres traduz `unique_violation` em `23505`;
3. o aparelho trata `23505` como recusa permanente.

O **1** era medido — `src/sync/recusa.test.ts` lê o SQL e exige que cada código promovido
apareça por nome numa migração nossa, com o docblock dizendo por que: *"duas coisas escritas
pela mesma mão não guardam nada"*. O **3** era medido pelos testes do classificador. O **2**
era esta linha, dentro do próprio teste:

```ts
const NOME_DO_CODIGO: Record<string, string> = { '23505': 'unique_violation' };
```

Uma constante escrita por mim, no arquivo que existe para guardar a corrente. A guarda evitou
com cuidado a mão dupla no fato 1 e **a reintroduziu no fato 2**, uma linha acima.

**Por que importa.** Se essa tradução estivesse errada, nada ficaria vermelho — e o efeito seria
o defeito mais caro que este projeto conhece: a recusa CERTA voltaria classificada como
passageira, a fila tentaria de novo para sempre, e tudo o que o aparelho gravasse depois ficaria
preso atrás, calado. É exatamente o que a `0051` diz no topo dela que não pode acontecer.

**E o instrumento que vê isso já existia e estava olhando para o outro lado.** A garantia 28 do
`db:verify` **dispara este erro** contra um Postgres de verdade e joga o código no lixo
(`2>&1 >/dev/null`), porque ela pergunta outra coisa: se a linha entrou. A resposta estava
passando pela mesma linha de comando e sendo descartada.

**O que mudou.** A garantia 32 dispara a recusa, lê `sqlstate` de **dentro** do Postgres (num
bloco com `exception`, não da mensagem do `psql` — formato de texto de cliente muda de versão,
`sqlstate` é o valor) e confere contra a lista lida do arquivo do aparelho. Duas mãos de
verdade: o código vem do servidor, a lista vem do TypeScript, e nenhuma passou pela outra.

### A mutação que isola o fato 2, e por que ela é a única que serve

Duas tentativas minhas de provar a guarda **não provaram nada**, e as duas por serem pegas por
outras réguas:

| mutação | quem pegou |
|---|---|
| `23505` → `23999` na lista | a guarda de TypeScript (o novo código não tem migração que o nomeie) |
| a lista VAZIA | os testes do classificador |

A que isola o fato 2 tem de manter todo o resto **consistente**: trocar o `errcode` da migração
para outro nome de condição REAL (`check_violation`) *e* acertar o mapa do teste para
acompanhar — o cenário exato da constante escrita à mão. Resultado medido: **TypeScript 4/4
verde**, e a garantia 32 reprovando com *"o servidor recusa com SQLSTATE 23514, e o aparelho só
trata [23505] como permanente"*.

É a forma geral da regra deste arquivo sobre plantar o defeito que a asserção NOMEIA: quando a
corrente tem três elos e duas réguas, a mutação que mede a régua nova é a que deixa as outras
duas satisfeitas. Qualquer outra mede as antigas.

### E a régua nova tinha um defeito próprio, achado ao prová-la

A extração da lista fazia uma pergunta só, e por isso confundia dois casos: **lista vazia** e
**linha não encontrada** davam a mesma resposta vazia, e a mensagem saía *"não deu para ler"* —
mandando consertar a régua quando o defeito era o conteúdo. Viraram duas perguntas: a linha
existe, e o que tem nela.

*Detector que não distingue os dois casos não entra* — a frase já estava escrita neste
repositório, para o medidor de tinta das fotos. Ela se aplicou igual a um `sed` de nove
caracteres.

### As três afirmações que caíram com isto

- **O topo da `0051`** dizia "NÃO PODE SER APLICADA SOZINHA" dois dias depois de a razão deixar
  de valer, e é a primeira coisa que alguém lê antes de rodar. Metade do aviso caiu; a outra
  metade fica e **não trava**: o segundo celular mantém no razão local uma conferência que o
  servidor recusou, até o estorno do degrau 3 existir. A comparação é o que decide — sem a
  migração o servidor aplica a correção DUAS vezes, o número autoritativo fica errado em
  silêncio, e o razão é append-only, então o erro vira histórico.
- **A medida do item no roadmap não podia ficar vermelha.** Ela procurava
  `discrepancy_once_per_group`, nome que não existe em lugar nenhum do repositório — a função é
  `one_standing_check_per_shipment`. Medida que procura o que nunca existiu prova a ausência de
  graça, e continuaria provando no dia em que alguém construísse a coisa. É a mesma família do
  `mesmaTelaEmTodas([])` que respondia "iguais" tendo lido nada: **guarda que não pode falhar.**
- **O docblock de `pendingCount`** dizia que quem conta as recusadas é `rejectedEntries` — a
  função que o portão P1 recusou por não ter chamador, escrita e apagada no mesmo commit. Quem
  conta é `rejectedCount`, logo abaixo. Comentário que sobrevive à função que ele cita é a
  versão pequena de tudo o que está escrito acima.

---

## 11 de setembro — a oficina achou um sobrevivente MEU, e a causa era a régua estar do lado de fora

**O achado.** A guarda que a tela da compra ganhou horas antes — `if (baseUnits <= 0) return
null;` — **atravessou a suíte inteira** no `npm run mutate`. Trocada por `if (false)`, nada
reprovou.

E eu tinha provado essa guarda. No navegador, de verdade, plantando o defeito: a checagem
reprovou dizendo *"a tela diz o que fazer, em vez de só não reagir"*. A prova estava certa e
estava **no lugar errado para quem mede**: `mutate` roda a suíte de unidade, e a unidade não
renderiza tela.

**Por que isso importa mais que o defeito.** Uma regra protegida só pelo navegador é uma regra
que o `mutate` reporta como desprotegida para sempre — então ou o relatório mente, ou o
conserto está pela metade. E a `e2e` não roda em todo push (por decisão de 5 de setembro, a
pesada só vai para `main`), então na prática a regra ficaria semanas sem ninguém.

**O que mudou.** `src/layers.test.ts` ganhou a invariante, e ela não é "a linha que eu escrevi
existe": **toda CHAMADA de `purchaseToBaseUnits` tem de recusar o resultado zero.** É o padrão
que este repositório já usa para regra de tela que a unidade não alcança — a mesma casa onde
mora a régua da porcentagem montada à mão.

### E ao escrevê-la o SEGUNDO chamador apareceu

`src/assistant/skills.ts:376` também converte, e também não recusava: ele guardava `packs <= 0`
— o que a **pessoa** disse — e não o resultado da conversão, que é o que vai para o razão. Duas
perguntas diferentes escondidas numa.

O efeito: o assistente montava o rascunho, mostrava *"0,4 × unidade = 0 g"* como confirmação
legítima, e a recusa vinha no `apply` — erro RECLAMANDO depois do toque, quando a Lei 5 manda
impedir antes. E antes da guarda da camada de dados, nem reclamava: gravava.

*Uma varredura por "quem mais chama isto" custa dez segundos e este repositório já tem a regra
escrita — "conserto de pele não termina no arquivo que o mostrou". Ela vale para aritmética
igual.*

### A régua por ARQUIVO aprovava o defeito; a régua por CHAMADA o pega

A primeira versão perguntava *"este arquivo compara a conversão contra zero em algum lugar?"* —
e **não pegava o sobrevivente.** `app/purchase.tsx` converte duas vezes: uma para a dica embaixo
do campo, outra para montar o lançamento. A comparação da dica satisfazia a régua enquanto a que
IMPEDE era removida.

**Régua satisfeita pelo vizinho da linha errada é régua que aprova o defeito** — e ela é
indistinguível de uma régua boa enquanto ninguém planta o defeito exato. Provada agora nas três
direções: o sobrevivente pego pela linha (`app/purchase.tsx:295`), o assistente pego pela dele
(`skills.ts:376`), e `=== 0` **não** virando alarme falso, porque régua que só aceita a forma
que eu escrevi ensina a ignorar a saída.

---

## 11 de setembro — `e2e:fast` disputa consigo mesmo, e a vítima não é aleatória

**O achado.** A mesma checagem — *"a listed stick leaves the storeroom when the run is
recorded"* — reprovou em **duas** execuções da suíte inteira, com a máquina livre nas duas, e
passou **isolada** nas duas vezes que eu a rodei sozinha.

Pelo texto que este arquivo já tinha, isso era ambíguo: *"a régua não é a forma da falha, é a
repetição isolada… passou sozinha, era disputa; falhou de novo, é código"*. Ela passou sozinha,
então era disputa — mas "a mesma checagem duas vezes" me parecia sinal de defeito, e eu quase
fui procurar um.

**O que faltava na régua.** `e2e:fast` roda **quatro fatias em paralelo, numa máquina de quatro
núcleos, por desenho** — ele existe justamente para isso (7 min → 2 min 40). Então ele disputa
**consigo mesmo**, sempre, mesmo sem emulador e sem barra rodando junto. E disputa não é
uniforme: a checagem mais pesada da fatia é a primeira a estourar o tempo.

Daí a consequência: **"a mesma checagem falhou duas vezes" não é evidência de defeito sob
`e2e:fast`** — é evidência de que ela é a maior da fatia dela. O que separa os dois casos
continua sendo a repetição isolada, e só ela.

*O que isso NÃO autoriza: chamar de disputa sem medir. As duas execuções isoladas custaram três
minutos cada e são a diferença entre saber e achar.*

---

## 11 de setembro — a guarda do marcador era cega exatamente onde a tela TRANSFORMA o molde

**O achado, e ele chegou pela suíte de navegador.** `app/products/new.tsx` fazia
`t.app.catalog.flavors.toUpperCase()`, e essa chave é `'Variações de {{type}}'`. A tela de
cadastrar o primeiro produto — a que o dono disse que não conseguia usar — mostrava
**`VARIAÇÕES DE {{TYPE}}`**, desde 4 de setembro. O irmão a duas portas (`app/catalog.tsx`)
preenchia certo.

**E existia guarda para isso.** `nenhum texto com marcador chega à tela sem o fill`, em
`src/dictionary.test.ts`, é boa: resolve o caminho inteiro contra o dicionário de verdade, trata
apelido por arquivo (`const words = t.app.extract`) e anda de trás para frente pelos parênteses
para saber se a leitura está dentro de um `fill(` — com a razão medida escrita ao lado, porque
uma janela de LINHAS acusava sete frases inocentes num encadeamento de ternários.

Ela não pegou por um detalhe do padrão: ele casa o caminho pontuado **inteiro**, então
`t.app.catalog.flavors.toUpperCase` resolvia para `app.catalog.flavors.toUpperCase`, que não é
chave de nada, e a busca no conjunto falhava em silêncio.

**Ou seja: a régua era cega justamente quando a tela TRANSFORMA o molde** — e transformar é o
caso com mais chance de ser engano, porque quem chama `.toUpperCase()` está pensando em caixa,
não em interpolação. `.trim()`, `.slice()` e `.replace()` escapavam igual.

O conserto é cortar de trás para frente até achar uma folha, e ele **não abre falso positivo**:
só string tem `{{`, string é folha, então nenhum caminho com marcador tem filhos. Um caminho
mais longo terminando numa folha com marcador só pode ser um método chamado em cima dela.

**E a mesma régua acusou o meu comentário.** Ela lê o arquivo cru, e eu escrevi acima do conserto
um comentário citando `t.app.catalog.flavors` para explicar a cicatriz. É o alarme falso que a
régua de opacidade teve no mesmo dia, pelo mesmo motivo, e com a mesma correção — apagar o
comentário mantendo as quebras, porque quem reporta `arquivo:linha` precisa da contagem.

*Duas réguas deste repositório precisaram de `semComentario` no mesmo dia. A terceira que nascer
já devia começar com ele.*

### E o defeito VIZINHO, que é o pior de i18n que este projeto achou: verde em dois idiomas de três

Ao consertar o cabeçalho sem tipo escolhido, apareceu o que `app/catalog.tsx` fazia:

```ts
fill(t.app.catalog.flavors, { type: '' }).replace(/\s+de\s*$/i, '').trim()
```

Enche o molde com vazio e apaga o `" de"` pendurado. Funciona em português (*"Variações de"* →
*"Variações"*) e em espanhol, **por coincidência de preposição**. Em inglês a chave é
`'Variations of {{type}}'` e a régua procura "de": a tela mostrava *"VARIATIONS OF"*.

**Nenhum teste de português falha, nenhuma tela brasileira mostra nada errado, e o defeito só
existe na língua que ninguém abre para conferir.** É a forma mais barata de sobreviver a uma
suíte: estar certo no idioma em que ela foi escrita.

O conserto não é uma régua melhor de recorte — é **outra chave**. `flavorsAll` existe nos três
idiomas e cada tradutor escreve a dele, porque a frase de cada língua é da língua e não uma
fórmula com um pedaço removível. E entrou guarda para a classe: **nenhuma tela opera com bisturi
o texto que veio do dicionário** (`.replace`, `.slice`, `.substring`, `.split`), com zero
violações hoje e a cicatriz provada nos dois sentidos — `.toUpperCase()` de propósito **fora** da
régua, porque caixa não é gramática e a palavra continua inteira.

### O que eu ia fazer errado, e a medida impediu

Eu comecei escrevendo uma guarda NOVA para o marcador cru, sem procurar a que existia. Ela deu
**~40 falsos positivos** (ternário escolhendo o molde com o `fill(` abrindo linhas acima) e
duplicava uma régua melhor. Saiu inteira.

A regra deste arquivo — *"antes de chamar algo de defeito, procure a decisão"* — tem uma irmã que
eu acabo de pagar: **antes de escrever uma guarda, procure a guarda.** Achar a que existe e
consertar o buraco dela custou menos que a minha, cobre mais, e deixa uma régua no lugar de duas
que discordam.

---

## 12 de setembro — a `0051` recusava a RETENTATIVA da própria conferência aceita

**O achado, medido contra um Postgres de verdade com a forma exata com que o aparelho escreve:**

```
insert into movements (...) values (...) on conflict (id) do nothing;
ERROR:  esta remessa já foi conferida
```

Um celular sozinho. Nenhuma segunda pessoa, nenhuma segunda doca.

**Por que acontece.** A fila sobe por `upsert(linha, { onConflict: 'id' })`, que em SQL é
`on conflict (id) do nothing`. Gatilho `before insert` dispara **antes** de o conflito de chave
primária ser detectado, então a mesma linha reenviada entra no gatilho como se fosse nova — e o
`exists` da regra encontra **ela mesma** de pé.

**E o caminho é o comum, não o raro.** O servidor grava, a resposta se perde — a zona morta da
doca, que é a razão de a fila existir. `markSent` não roda, `sent_at` fica nulo, e o `drain`
seguinte reenvia a MESMA entrada. A recusa volta como `23505`, `classeDaRecusa` a chama de
permanente **com razão** (é o código que nós mesmos escolhemos ali), e `markRejected` põe a linha
de lado para sempre — `outbox.ts` diz em prosa que o que sai de lado não volta. A conferência de
quem estava sozinho na doca desaparece.

Isso contradiz duas coisas escritas, e uma delas é da própria migração: a fundação da fila
(*"mandar a mesma entrada duas vezes é inofensivo: o servidor resolve por id"*) e o docblock da
`0051` (*"A fila de um celular subindo sozinha, que é o caso comum, nunca disputa nada"*).

**Por que as duas garantias não pegaram, e é isto que vale guardar.** A 28 e a 32 exercitam a
regra com `insert` cru e **id novo** — a forma de quem escreve o teste. O aparelho escreve com
`on conflict (id) do nothing` e, na retentativa, com o **mesmo id**. Duas garantias detalhadas,
quatro casos entre elas, e nenhuma usava a forma real.

*A régua que sai daqui: quando a coisa protegida é o que o APARELHO manda, a garantia se escreve
na forma com que ele manda — mesmo verbo, mesmo `on conflict`, mesmo id na retentativa. Escrever
`insert` cru é medir um cliente que não existe.* O conserto é uma linha (`and m.id <> new.id`,
migração `0060`) e o quinto caso da 28 fica vermelho sem ela.

### E lendo essa mesma regra apareceu uma divergência latente, dita em voz alta pela própria `0051`

A recusa de conferir duas vezes existe nos dois lados e **não é a mesma frase**: no aparelho
`recordCheck` conta `discrepancy` de pé no GRUPO; no servidor o gatilho conta no grupo **e item**.
Hoje as duas concordam porque nada confere item por item — no dia em que a doca contar, o aparelho
recusa o que o servidor aceitaria.

O que faz disto um registro e não uma acusação é onde a diferença está escrita: a `0051` diz
**"o predicado é o mesmo do aparelho"** na frase de destaque e, na linha seguinte, *"aqui é a mesma
frase noutra linguagem, com o item junto"*. É a classe que este arquivo já nomeou — *fronteira dita
em voz alta continua sendo fronteira*: a honestidade do comentário documenta o buraco para quem lê
o código, e quem lê a promessa lê que não há buraco.

E a saída boa já aconteceu por acidente: o `comment on function` que a `0060` re-emitiu **não**
repete a promessa — diz *"uma conferência de pé por remessa e item"* —, então quem consultar o
banco lê a verdade. O cabeçalho da `0051` fica como está porque migração que já rodou não se
edita; o que fecha de verdade é a decisão de dono do item 42, que é quem decide se a doca passa a
contar por item.

---

## 12 de setembro — o estorno parcial obrigou TRÊS predicados a crescer, e todos diziam "alguma"

**O achado.** O aplicativo mandava, nos três idiomas, *"desfaça a conferência no extrato e
confira de novo"*, e a dica da `0051` repetia no servidor. **Nenhum dos dois era possível.**

A conferência não tem ato próprio: `recordCheck` reusa o grupo da remessa, e **tem de reusar** —
é essa chave que faz a trava do servidor reconhecer a mesma carga conferida por dois celulares.
Dar grupo próprio à conferência quebraria a proteção que impede o saldo de dobrar. Então o único
desfazer era por ato, e ele estornava as pernas da transferência junto: a carga voltava para a
fábrica no papel, e `recordCheck` passava a responder *"remessa não existe"* — um erro de
programador para quem obedeceu à instrução da tela.

**O que mudou.** `undoCheck` desfaz só a conferência, com o escopo por espécie descendo até o
`SELECT` (`planReversal` e `reverseGroup` ganharam `apenas`), e o extrato ganhou a ação estreita
que a mensagem nomeia — em linha própria, porque duas ações destrutivas encostadas com rótulos
parecidos são o convite para tocar a errada.

**E aqui está o que este conserto ensinou, que é maior que ele.** Introduzir o primeiro estorno
PARCIAL do sistema derrubou três predicados de uma vez, e os três estavam escritos da mesma
maneira errada:

| onde | dizia | tinha de dizer |
|---|---|---|
| `planReversal.alreadyReversed` | alguma perna estornada | nenhuma perna de pé |
| `shipmentsOn.checked` | existe conferência | existe conferência **de pé** |
| a agregação do extrato | alguma perna estornada | nenhuma perna de pé |

Enquanto o único desfazer era por ato, **"alguma" e "nenhuma de pé" eram a mesma pergunta**: ou
tudo estava estornado ou nada estava. Os três estavam certos por uma invariante que ninguém
escreveu e que eu quebrei ao acrescentar uma capacidade.

*A régua: antes de acrescentar um caso parcial a um sistema que só conhecia o caso total, procure
os predicados que a totalidade tornava equivalentes.* `grep` por `some(` e por `EXISTS` ao redor
do conceito custa minutos; descobrir pelo terceiro sintoma custa a rodada. E nenhum dos três daria
teste vermelho sozinho — os três só falham depois de o estorno parcial existir, que é exatamente
o commit em que eles param de ser equivalentes.

### E a terceira vez do acento grave

`create or replace` de comentário SQL dentro de template literal quebrou a compilação **três
vezes nesta sessão**, sempre com a mesma cara: `` `algo` `` numa linha `--` dentro de um
backtick-string fecha a string, e o `tsc` acusa dezenas de linhas abaixo (`',' expected`,
`Octal literals are not allowed`). Três vezes não é descuido, é armadilha da forma: em prosa
técnica deste projeto o acento grave é reflexo, e dentro de template literal ele é um
delimitador. **Comentário SQL dentro de template literal escreve o identificador sem acento
grave.**

---

## 12 de setembro — a falta na entrega entra no faturamento como VENDA, e a saída documentada é a porta errada

**O que se viu.** Medindo o que sobrou do conserto do `undoCheck` — quem, afinal, grava a falta
de uma remessa —, a cadeia inteira apareceu, e ela tem três elos:

1. **A doca não tem como gravar falta.** `recordCheck` aceita `counted`, a contagem de verdade
   item por item, e o único chamador de produção é `app/(tabs)/transport.tsx:143`, que chama
   **sem** ela. Sem lista, toda perna vira diferença **zero** — a conferência da doca só sabe
   dizer "chegou tudo", e o próprio docblock decide isso por escrito: *"um formulário de
   contagem por item, no celular, na doca, ninguém preenche."*
2. **A saída que a decisão indica é a tela do lugar**, e ali a espécie do movimento é decidida
   por onde o lugar está: `recordCount` com `delta < 0` numa loja própria
   (`RETAIL_PLACE_KINDS = ['own_store']`) e um item que se vende grava `kind='sale'` com o preço
   do acordo **congelado** (`src/data/repository.ts:1831`).
3. **Nenhum dos sete motivos de perda quer dizer "nunca chegou"** — `melted`, `broken`,
   `expired`, `courtesy`, `internal_use` (`0001`), `production_error`, `quality` (`0054`).

**Por que importa.** Três caixas que saíram da fábrica e não chegaram na loja entram no
faturamento como se alguém as tivesse comprado, com receita congelada pelo preço do acordo. É
receita inventada dentro do número que decide onde o dinheiro vai — e o razão é append-only,
então o erro não se corrige, vira histórico. A distinção que o projeto faz desde o começo é que
*"loja própria é transferência, não venda"*: a receita é reconhecida na CONTAGEM, e é
exatamente por isso que uma falta de transporte contada na prateleira vira faturamento.

**A régua que isto ensina, e ela é sobre como eu li a decisão.** O item 28 do plano já tinha
passado por aqui e eu o fechei citando a decisão certa. A decisão é real e continua valendo; a
frase seguinte dela — *"contar ali grava a diferença no razão"* — é verdadeira num almoxarifado
e falsa numa loja própria, onde a diferença tem nome de venda. Ou seja: **procurei a decisão,
achei, e não medi o que a saída dela FAZ.** A regra desta casa manda procurar a decisão antes de
chamar algo de defeito; o que faltava era a metade seguinte — a decisão aponta uma porta, e a
porta também se mede.

**O que mudou por causa disso.** O item 42 do plano, com a medida `ausente
app/(tabs)/transport.tsx :: counted` — no dia em que a doca ganhar contagem por item, a guarda
do plano fica vermelha —, e a pergunta na lista do dono no corpo da PR. **Não virou commit de
código de propósito:** qual movimento é *"saiu da fábrica e não chegou"* mexe em
`movement_kind` ou no enum de perda, que é o P3 desta casa — caro e permanente —, e escolher a
palavra por ele seria decidir calado o que o razão vai repetir para sempre.

---

## 12 de setembro — a frase dizia "onde ver" e não havia onde; e três achados sobre a própria oficina

**O que se viu.** Os Ajustes contavam *"{{count}} não sobem: o servidor já tinha esse
registro"*, e o docblock daquela frase promete *"diz o que ficou, **onde ver**, e segue"*. O
"onde ver" não existia: a pessoa lia "3 não sobem" sem ter como saber quais três. É a mesma
classe do defeito que esta rodada consertou no extrato — texto que manda ir a uma porta que
não existe —, e apareceu porque fui medir o que sobrou do `undoCheck`.

**O que mudou.** `app/de-lado.tsx` mais `checksSetAside` (`rejectedEntries` no `outbox.ts` e uma
consulta ao razão) mostram cada conferência posta de lado com os quatro fatos que a decisão do
dono nomeia — data, hora, lugar e quem operou. Três coisas que a tela faz de propósito:

1. **o portão do nome entra na CONSULTA**, como no extrato: com `names_who_recorded` desligado o
   nome não sai do banco. Esconder na tela seria decoração;
2. **a linha que não é conferência continua na lista**, com o fato nulo em vez de descrição
   inventada — porque `rejectedCount` conta TODAS, e duas telas contando a mesma coisa com
   números diferentes é defeito que este repositório já pagou;
3. **a porta só é desenhada quando há algo de lado.** Porta permanente para o que nunca
   aconteceu é o alerta inventado com outro rosto.

Ela fecha METADE do degrau 3. A conferência que ganhou está no servidor e não há sincronia de
entrada para `movements`, então mostrar as DUAS e deixar a primeira pessoa aceitar continua
esperando — e a pergunta de esquema que decide isso é do dono.

### E a oficina, medida enquanto rodava, devolveu três achados

**1. Duas mutações ficaram SEM MEDIDA, e ninguém teria notado.** O commit anterior deu o
parâmetro `apenas` a `planReversal`/`reverseGroup`, e com isso duas âncoras do
`scripts/mutate.mjs` deixaram de casar: a da checagem de concorrência de dentro do estorno e a
que prova que o estorno alcança o consumo junto da produção. O relatório disse *"o trecho
mudou"* — que é a resposta certa e a única razão de eu saber. **Enquanto uma âncora está velha,
a regra que ela protege não tem rede**, e o único instrumento que denuncia isso é a execução
que mede a árvore nova. Consertadas as duas.

**2. A mutação que eu escrevi era pega pelo MOTIVO ERRADO.** Para provar o portão do nome do
operador troquei `CASE WHEN ? = 1 THEN pe.name END` por `pe.name` — e o teste reprovou com
`column index out of range`, do SQLite: **o marcador `?` saiu junto, e a consulta morreu antes
de o portão ser exercitado.** "Pego" estava certo e não queria dizer nada; quem removesse o
portão mantendo a contagem de parâmetros — o defeito plausível, de quem "simplifica" a consulta
— passaria. A troca certa mantém o marcador e faz o portão virar nada (`... THEN pe.name ELSE
pe.name END`), e aí a reprovação diz a frase da asserção: *"sem a chave ligada, o nome não sai
da consulta"*. *A régua: é a regra de plantar o defeito que a asserção NOMEIA, virada para
dentro — a asserção estava boa, a mutação é que media outra coisa.*

**3. O `mutate` LÊ a árvore viva enquanto roda — e o custo NÃO foi zero, ao contrário do que eu
escrevi duas horas antes nesta mesma entrada.** O `CLAUDE.md` dizia que ele "nunca mais toca
a árvore de trabalho", e isso é verdade sobre escrever. `julgar()` lê o `original` de
`process.cwd()` **no instante de julgar cada defeito** — então eu editei `src/data/repository.ts`
com a oficina rodando e o `.mutate/w0` ficou com a minha versão nova contra um `outbox.ts` do
instantâneo, sem o `export` que ela importa. Aqui foi inofensivo por sorte de módulo, e isso
foi **medido e não suposto**: sem `"type": "module"` o `tsx` compila para CJS, e import nomeado
inexistente vira `undefined` em vez de erro de ligação. Em ESM a suíte da cópia falharia sem
mutação nenhuma e **toda** mutação seguinte sairia "pega" sem a suíte ter sido consultada — o
defeito de 3 de setembro voltando por outra porta.

**E a frase "inofensivo por sorte de módulo" estava errada, medida na execução seguinte.** O
raciocínio cobria o mecanismo que eu tinha examinado e esquecia o banal: `julgar()` pode ler o
arquivo **no meio da minha escrita**. O efeito tem nome e endereço — a mutação do `reversed` do
extrato saiu **"pega"** na execução que leu a árvore viva e **SOBREVIVENTE** na seguinte, com a
árvore parada. A segunda é a verdadeira, e está reproduzida na mão: `npm test` **773 verdes com o
defeito plantado**. Um falso "pego" sobre um sobrevivente de verdade é o pior resultado que esta
ferramenta pode dar, porque ele **fecha a caça** — e eu tinha escrito na rodada anterior que essa
mutação estava provada, contando quatro mutações onde só três tinham sido exercidas na mão.

*A régua, em duas metades: **nada de editar fonte enquanto a oficina roda**, e **veredito de
execução que atravessou edição não vale** — repita com a árvore parada. E a irmã dela, que é
sobre mim: "listei a mutação" não é "provei a mutação".*

**4. E o custo da barra envelheceu, o que muda uma decisão.** Medido: `mutate` **28 min 39 s**
(139 mutações), `e2e:fast` **6 min 12 s** (58 checagens), suíte **11,6 s** com a máquina livre e
19,4 s com a oficina por cima. O `CLAUDE.md` dizia "seis minutos" e "mais três" — números de
quando eram 64 mutações e 338 testes. Não é regressão: o custo da oficina é *(mutações) ×
(duração da suíte) ÷ (frentes)*, e os dois primeiros fatores crescem com o projeto. Importa
porque é esse número que alguém usa para decidir se dispara a oficina no meio da rodada.

**5. E uma correção ao que EU venho dizendo duas vezes por rodada.** Ao fechar cada etapa eu
relato *"as contagens de aviso do portão idênticas — o SQL novo não acrescentou nenhum"*. A
segunda metade da frase é mais forte que a medida. O `90-sql-concat` casa quando o VERBO de SQL
e a interpolação estão na **mesma linha adicionada**, e as consultas desta casa são literais de
gabarito de muitas linhas: a minha nova termina em `WHERE m.company_id = ? AND m.id IN
(${marcas})`, sem verbo na linha, então ela não conta — e a contagem ficaria em 55 de qualquer
jeito. A contagem idêntica prova que **nenhum aviso novo apareceu**, e não que nenhuma
interpolação nova existe. Não é buraco a caçar: o guard é `WARN` por desenho, e as 55 são a
população conhecida de falso positivo (`${marcas}` é lista de marcadores, `${naoEstornado(...)}`
é fragmento constante — nenhuma vem de quem digita). O que muda é a frase que eu escrevo.

---

## 12 de setembro — o QUINTO predicado do estorno parcial não tinha asserção, e a oficina o pegou

**O que se viu.** A execução da oficina sobre `5cf788b` fechou com **um sobrevivente**: trocar
`if (l.reversed === 0) ja.reversed = false` por `if (l.reversed === 1) ja.reversed = true` na
agregação do extrato atravessa os 773 testes. Reproduzido na mão, com a árvore parada, para não
depender do relatório: `npm test` verde com o defeito plantado.

**Por que passou.** A entrada de 12 de setembro sobre o estorno parcial conta que três predicados
tiveram de crescer de *"alguma perna estornada"* para *"nenhuma de pé"*. O terceiro deles é a
bandeira `reversed` do extrato — e ela é **lida pela TELA**, que decide desenhar "Desfeito" e
esconder o botão de trazer a carga de volta. A unidade não renderiza tela, então a bandeira nunca
foi comparada com nada: eu troquei a linha, escrevi a mutação, e **não escrevi a asserção**.

É a mesma forma do sobrevivente de 11 de setembro (`app/purchase.tsx`, `if (baseUnits <= 0)`), e a
diferença é instrutiva: lá a régua tinha de sair para uma guarda de FONTE, porque a regra morava
na tela. Aqui não — a bandeira é um **fato devolvido pela camada de dados**, e fato se compara com
igualdade num teste de Node. O que faltava era só a linha.

**O que mudou.** O teste do estorno parcial ganhou a quinta parte: depois de desfazer só a
conferência, `ledgerExtract` diz `reversed === false` (a carga está de pé) e `temConferencia ===
false` (não há conferência de pé para desfazer, então a porta estreita sai). As duas metades da
mesma agregação agora têm mutação própria, e as duas reprovam **pela frase que a asserção
escreve** — medido uma por uma, com a injeção conferida no disco antes de eu ler a medida.

**E o achado maior é sobre o instrumento, não sobre o extrato.** Esta mutação saiu **"pega"** na
execução anterior — a que leu a árvore viva enquanto eu editava — e sobrevivente nesta. O falso
"pego" é o pior resultado possível de uma oficina, porque ele **fecha a caça**: eu tinha escrito
na rodada anterior que os quatro predicados estavam provados, quando três tinham sido exercidos na
mão e o quarto só listado. Dois hábitos saem daqui: **veredito de execução que atravessou edição
não vale**, e **"listei a mutação" não é "provei a mutação"**.

---

## 12 de setembro — a frase da tela afirmava uma CAUSA que só valia por coincidência do tamanho de uma lista

**O que se viu.** Uma hora depois de a tela do que ficou de lado entrar, o portão P1 aplicado ao
meu próprio commit: `recusa_codigo` sai do banco (`markRejected` grava, `rejectedEntries` lê,
`LinhaDeLado.codigo` devolve) e **morre na camada de dados** — nenhuma tela o lê.

E o buraco não era o campo sem leitor: era a frase. A tela diz *"o servidor já tinha o registro da
mesma carga"* sobre TODA linha posta de lado, e isso é verdade só para `23505`. Hoje ele é o único
código promovido a permanente, então a frase estava certa **por coincidência do tamanho de uma
lista noutro arquivo** — e o docblock de `PERMANENTES` diz, com todas as letras, que promoção
acontece, *"cada uma com a medida ao lado"*. No dia da segunda, a tela explicaria como duplicação
uma recusa que não é.

**O que mudou.** `todasJaExistem` (em `src/sync/recusa.ts`, que é o módulo que sabe o que um
`SQLSTATE` significa) responde a pergunta, a tela escolhe entre duas frases, e a genérica existe
nos três idiomas. Zero lista devolve `false`: *"todas" de nada não é afirmação sobre o mundo.*

**E medir a régua antes do alvo economizou a rodada.** O conserto óbvio era trocar
`new Set(['23505'])` pela constante nomeada — e isso **quebraria a garantia 32**, que parseia
exatamente aquela linha com `sed` para comparar a lista contra o `sqlstate` que um Postgres de
verdade devolve. Rodei o parser do verificador contra uma cópia remendada antes de tocar na árvore:
com o literal no lugar ele continua extraindo `23505`. Então a duplicação do literal **fica**, com
a razão escrita nos dois lados, e um teste amarra as duas pela porta pública
(`classeDaRecusa(CODIGO_JA_EXISTE)` tem de ser `permanente`). *Elegância que apaga uma medida
contra o servidor não é elegância.*

### E a mesma varredura achou uma decisão de SINAL morando dentro da tela

`c.difference < 0 ? falta : sobra` decidia, no componente, a palavra que a pessoa lê. É a forma
exata do sobrevivente de 11 de setembro (`app/purchase.tsx`): regra de tela que a oficina dá como
desprotegida para sempre, porque ela mede a unidade e a unidade não renderiza tela. Virou
`tipoDaDiferenca` no domínio do razão, com **três** respostas — zero é um fato, não a ausência de
uma falta, e *"faltaram 0 g"* seria o alerta inventado com outro rosto.

Três mutações novas, e as três reprovam pela frase que a asserção escreve. **Duas delas só depois
de eu dar mensagem às asserções:** `assert.equal(tipoDaDiferenca(-500), 'falta')` reprovava com
*"Expected values to be strictly equal"*, que não nomeia defeito nenhum. A régua desta casa manda
plantar o defeito que a asserção NOMEIA — e asserção sem mensagem não nomeia nada, então a
segunda metade da regra é escrever a mensagem.

---

## 12 de setembro — o portão P1 aplicado ao meu próprio commit de uma hora antes

**O que se viu.** `checksSetAside` devolvia doze campos e a tela — o **único** consumidor — lia
dez. `rowId` e o `movement_group_id` da conferência saíam do banco, atravessavam a camada de dados,
entravam no tipo público e morriam ali.

**Por que importa, e por que não é purismo.** É a doença que o P1 existe para pegar, a mesma de
`Draft.kind` e de `assistant_phrase` com índice dedicado e nenhuma escrita. O custo não é o byte: é
que campo devolvido **parece** contrato. Quem ler o tipo daqui a um mês vai supor que alguém
depende deles, e vai carregá-los para a próxima consulta — foi assim que `operator_id` juntou sete
escritores e zero leitores.

**O que mudou.** Os dois saíram, e a razão ficou escrita no docblock **onde alguém vai querer
acrescentá-los de volta**: o grupo seria útil para abrir o ato no extrato, e `ledgerExtract` não
filtra por grupo — no dia em que filtrar, os dois voltam com o chamador no mesmo commit. O `rowId`
continua vivo em `RejectedEntry`, onde é lido de verdade para correlacionar a fila com o razão; o
que saiu foi a re-exposição.

*A régua desta entrada é só a hora do relógio: o portão P1 vale para o commit de uma hora atrás.
Eu o apliquei a `operator_id` (sete escritores, zero leitores) e a `purchases.supplier_name` no
código de outra semana, e não o apliquei ao que eu tinha acabado de escrever. Código novo é
exatamente onde a pergunta é mais barata de responder — e o único momento em que apagar não custa
nada.*

---

## 12 de setembro — o tacho rodava uma ficha e o lote carimbava outra, com o dinheiro junto

**O que se viu.** `production_runs` guarda o `recipe_version_id` da abertura e
`OpenRun.recipeVersionId` devolve esse campo. `closeProductionRun` **não o repassava**:
chamava `recordProduction`, que recarrega o grafo com `loadRecipeGraph` — e ele traz sempre
`MAX(version)`. Quem salvasse a fórmula nova entre abrir e fechar o tacho fazia o lote nascer
com a ficha NOVA e **o custo congelado dela**.

**Por que importa, e a conta é de cabeça.** O docblock do carimbo do lote diz o contrário com
todas as letras: *"sem este carimbo, corrigir a fórmula em março reescreve o que janeiro
custou — a taxa continua certa e a pergunta 'de que ficha veio?' passa a responder a receita
de hoje."* O carimbo existia e apontava para a ficha errada, o que é **pior que não existir**:
ele afirma procedência. E o custo congelado é o denominador de toda margem futura — na prova,
4 centavos por picolé viravam 8, com o lote rodando a fórmula de 4.

**A janela é o caso que o próprio código descreve:** *"uma corrida aberta às 23h de segunda e
fechada à 1h de terça"*. Basta a fórmula mudar nesse meio.

**O que mudou.** `loadRecipeGraph` aceita `fixar: { recipeId, versionId }`, `recordProduction`
aceita `fichaCravada`, e `closeProductionRun` passa `run.recipeVersionId`. Provado nos dois
sentidos, com a asserção do DINHEIRO antes da do carimbo — com o defeito plantado as duas
reprovam, e só a primeira é lida: *"esperava 4 centavos por unidade, veio 8"* explica o
prejuízo; *"esperava este uuid"* não.

### E a escolha do mecanismo é o achado que se paga guardar

O conserto que parecia mais geral era cortar por TEMPO — "a versão em vigor quando o tacho
abriu". Ele tem três furos, e dois só apareceram porque eu fui medir a régua antes de usá-la:

1. **`recipe_versions.effective_from` é gravado como DATA** (`at.slice(0, 10)`), então ele não
   consegue responder *"qual fórmula estava em vigor às 23h40"* — e o dossiê já registrava que
   esse campo não tem leitor. Usá-lo como corte seria um defeito **vestindo o nome certo**.
2. **`created_at` é instante e empata no mesmo milissegundo**, e o empate cai para o lado
   errado: a versão nova entra.
3. **Derivar o corte de `occurredAt` quebraria o caminho que o dono decidiu.** Em *"começar
   pelo fim"* a pessoa registra hoje a produção de ontem, às vezes com a ficha cadastrada
   hoje: nenhuma versão seria anterior ao fato, o grafo viria sem a receita, e a produção
   passaria a ser **recusada**. O conserto mais geral teria trocado um número errado por um
   registro que não acontece.

Id é exato e não empata, e a corrida já o tinha na mão. *A régua: quando há um identificador
gravado no instante do fato, ele vale mais que qualquer reconstrução por tempo — e antes de
reconstruir por tempo, olhe a GRANULARIDADE do campo que você ia usar.*

**E a fronteira fica dita porque ela é metade do problema:** o que se crava é a receita RAIZ,
a única que a corrida anota. Uma sub-receita editada entre abrir e fechar continua entrando
pela mais nova. Fechar isso pede um carimbo por sub-receita na abertura — e isso é construção,
não uma linha.

---

## 12 de setembro — a conta aberta do assistente não fechava, e faltava a metade que sai do estoque

**O que se viu.** `costPerProductUnit` soma três coisas: a massa, a embalagem **digitada** (o
rótulo, a fita — o que ninguém quis transformar em item) e a embalagem que **é item**, cotada
pelas notas de compra. O `detail` do assistente listava duas. Quem lista palito e saquinho como
item — o caso da fábrica do dono — via a manchete subir sem nenhuma linha explicando.

**Por que importa mais que o centavo.** É a Lei 6 pelo avesso: a conclusão abre uma conta que
**não fecha**, e conta que não fecha ensina a desconfiar do número inteiro, inclusive dos que
estão certos. A aritmética: 50 de massa + 5 de digitada + 3 de palito (milheiro a R$ 30) = 58,
e a manchete dizia 58 com duas linhas somando 55.

**O que mudou.** A linha *"Embalagem do estoque"*, que nasce só quando existe — zerada não vira
frase, porque "está tudo bem" é estado. A mesma tela de cadastro de produto já resolvia isto com
as três componentes nomeadas (`mixPlusBoth`), então o conserto **copia o conteúdo dela** em vez
de inventar palavra nova.

### E duas coisas que eu ia errar, as duas pegas por medir em vez de supor

**1. Eu ia chamar de defeito a diferença de ESCALA, e ela é decisão.** As linhas de embalagem
usam `formatUnitRate(..., 'a cada 1.000 unidades')` e a massa usa `formatMoney` — parecia
incomensurável. Medindo `formatUnitRate`: ela só troca de escala quando a taxa é **abaixo de um
centavo**, e o docblock da tela diz por quê — embalagem de meio centavo apareceria como R$ 0,00,
*"a tela dizendo de graça o que o razão já tinha parado de dar de graça"*. Com o palito a 3
centavos as três linhas saem na mesma escala e somam à vista. Não havia defeito de escala.

**2. O meu cenário quebrou dois testes que não têm nada com ele.** Acrescentar o palito ao
fixture compartilhado derrubou o teste do almoxarifado (que conta itens) e o da lista de compras
— o plano soma todos os produtos, e um segundo produto na mesma receita **dobrava** o que falta
comprar. A saída fácil era ajustar as expectativas dos dois para caber no meu cenário, e isso é
a pior troca possível num arquivo de guardas: eu mudaria o que eles medem para o meu teste
passar. O cenário passou a viver **dentro do teste**, com `{ ...data, listProducts }`.

*A régua: quando um fixture compartilhado resiste ao cenário novo, a resistência é informação —
ele está medindo outra coisa. Isola-se o cenário, não se ajusta a medida alheia.*

## 12 de setembro — estabilidade era o piso, não o alvo

O tremor do cabeçalho foi consertado em 10 de setembro pondo um TETO no ganho da
realimentação: 0,8, porque abaixo de 1 o laço não diverge. O dono confirmou no tablet que
o travamento acabou — e que ficou *"uma chacoalhadazinha"*. As duas coisas são verdadeiras
ao mesmo tempo, e a conta diz por quê: ganho `g` decai como `g^n` por quadro, então 0,8
leva **18 quadros (300 ms)** para a oscilação sobrar 2%, e ela é re-excitada a cada quadro
em que o dedo anda. Nunca trava e nunca para.

O que mudou: `GANHO_MAX` de 0,8 para 0,6 (18 quadros → 8, 300 ms → 130 ms), com o preço
escrito ao lado — é o mesmo botão que dá o comprimento da faixa, e 0,6 custa um terço mais
de rolagem para o cabeçalho encolher inteiro. E uma régua nova em `cabecalho.test.ts` que
reprova o 0,8: sem ela a suíte só sabia distinguir "diverge" de "não diverge".

**A lição de método, que é maior que o número:** um critério de estabilidade responde *se*
o sistema se acomoda, nunca *em quanto tempo*. Fechar um item de movimento com "está
estável" é fechar metade — e a metade que falta é justamente a que o olho vê. Quando o
conserto de uma oscilação é um teto de ganho, a pergunta seguinte é o **tempo de
acomodação**, e ela tem de estar na guarda, não na cabeça de quem consertou.

*E o conserto de raiz continua de fora:* o laço só existe porque a altura removida é altura
de LAYOUT. Cabeçalho fora do fluxo põe o ganho em zero e dispensa o teto — mexe nas 27
telas, e pede o tablet na mesma rodada.

## 12 de setembro — a linha que quebrava o nome não era a linha; era o número de coisas nela

A foto dos Ajustes mostrou "Pedidos dos / clientes" e "Quem / recebe / hoje" em duas e três
linhas. A rodada anterior já tinha trocado reticências por quebra ali, e estava certa: numa
lista onde a pessoa ESCOLHE, nome cortado é escolha impossível. O que ninguém perguntou é
por que a escolha entre cortar e quebrar existia — e ela existia porque a linha era uma fila
só com **cinco** coisas: nome, etiqueta de largura, etiqueta de esconder e dois chevrons. A
393 dp o nome fica com cerca de um terço.

Empilhar (nome na linha dele, controles na de baixo à direita, abaixo de 600 dp) faz as duas
alternativas desaparecerem em vez de escolher entre elas. **Quando duas saídas de um problema
são as duas ruins, a pergunta certa é quase sempre o que está criando o problema** — aqui,
uma fila com mais peças do que a largura comporta.

## 12 de setembro — o número sobreviveu ao laço que ele media

O teto de ganho do cabeçalho existia para impedir uma realimentação divergir. Tirando o
cabeçalho do fluxo, a realimentação virou **zero** — e o teto continuou sendo necessário, por
um motivo que não tem nada a ver com o anterior: com o `paddingTop` da lista constante, o topo
do conteúdo está em `altura - rolagem` e a base do cabeçalho em `altura - removidoAté(rolagem)`.
Taxa acima de 1 sobe o cabeçalho mais depressa que o conteúdo e **abre uma tira de papel vazio
entre os dois**.

Mesma álgebra, mesma derivada, mesma guarda — significado trocado: era **estabilidade**
(escolhida: 0,8, depois 0,6, margens de engenharia), virou **geometria** (derivada: 1 é a única
taxa que encosta os dois sem sobrepor). E o conserto de raiz ENCURTOU a faixa em vez de
alongá-la: 155 dp a 393 dp, contra 194 do primeiro remendo e 258 do segundo.

**A lição é sobre renomear.** Eu ia deixar `GANHO_MAX` no lugar, porque o valor caberia e as
guardas passariam. Deixar seria plantar a próxima sessão: quem lesse "ganho máximo" e quisesse
mais conforto baixaria o número — e baixar hoje não compra conforto nenhum, abre buraco. O nome
que diz o que o número DECIDE é o mesmo princípio que o `tokens.ts` aplica às peles (`ehPapel`
compila e devolve o mesmo defeito na pele seguinte), e aqui ele valia para um número.

## 12 de setembro — a terceira régua sobreviveu ao próprio defeito, e as duas irmãs não

A guarda nova tem três condições. Plantei os três defeitos que ela nomeia, um por vez: a
primeira e a segunda reprovaram na primeira tentativa; **a terceira ficou verde**.

Ela era `/useAnimatedStyle\([^)]*paddingTop/`. `[^)]*` para no primeiro `)` — e o primeiro `)`
depois de `useAnimatedStyle(` é o `()` da arrow function que TODO `useAnimatedStyle` recebe.
A régua nunca chegava ao corpo do estilo. Consertada com um andador de parênteses (o mesmo
recurso que a guarda de i18n já usava para achar o `fill(` ao redor de uma leitura).

**O que isso acrescenta à regra que já existia** (*"plante o defeito que a asserção NOMEIA"*):
provar UMA condição de uma guarda de três não prova a guarda. As três estão no mesmo `test()`,
com a mesma cara, escritas na mesma hora pela mesma mão — e duas boas não dizem nada sobre a
terceira. **A prova é por condição, não por teste.**

## 12 de setembro — "sem chamador" era verdade sobre a função e mentira sobre a conta

`daysUntilExpiry` estava listada em `layers.test.ts` como sem chamador, com a justificativa
escrita: *"a tela que trata 'venceu ontem' diferente de 'vence em três dias' não existe: hoje
`expiringSoon` filtra por data e não conta dias"*. A função de fato não tinha chamador. A
justificativa era falsa: `src/notify/facts.ts` contava dias — **a mesma subtração, à mão, duas
vezes** — e o limiar do aviso comparava essa contagem. O dossiê dizia que a duplicação estava
em "dois lugares"; medindo, eram **cinco**, e um dos dois que ele citava (`Mosaic.tsx`) já não
fazia a conta.

O conserto é uma primitiva de DATA no domínio (`diasDeCalendario`), com `daysUntilExpiry` e
`daysBetween` delegando a ela e os cinco sítios chamando o domínio. Plantado o sinal invertido,
**quatro** testes reprovam — dois deles são os antigos do `daysBetween` e do lote, que passaram
a proteger a função nova sem serem tocados. É o dividendo da delegação: teste velho vigiando
código novo.

**A lição é sobre a forma da justificativa.** Uma entrada em `SEM_CHAMADOR` afirma duas coisas:
que ninguém chama a função E que ninguém precisa dela. A guarda mede a primeira e aceita a
segunda por escrito — e foi a segunda que envelheceu, porque a conta que "ninguém fazia" estava
sendo feita a dez linhas de distância, sem o nome da função. **Justificativa de ausência se
mede pelo CONCEITO, não pelo símbolo:** `grep` pela divisão por um dia achou os cinco; `grep`
pelo nome achava zero e concordava com a mentira.


## 12 de setembro — "algumas animações" era plural, e a caça devolveu doze mecanismos

O dono disse *"algumas animações ainda dão uma tremida"* e eu tratei uma hipótese — o
cabeçalho. Seis frentes de leitura com três céticos por achado devolveram **doze
mecanismos**, e nenhum era impressão: cada um tem linha, conta e conserto de uma a dez
linhas. Eles caem em quatro famílias, e as famílias valem mais que a lista:

1. **Troca de ramo dentro da animação.** Quatro cenas de cabeçalho com ciclo 'volta' e
   opacidade 1 em `t→1`, 0 em `t=0`: um quadro de corte a cada volta, para sempre — o risco
   dos Pedidos apagava a cada 5 s, o engradado da Separação sumia a cada 5,6 s, a gota da
   fábrica estalava a cada 2,1 s, a folha da cópia teleportava 204 unidades a cada 2,8 s. O
   `Espelho`, no mesmo arquivo, fazia certo. E o relógio compartilhado fazia a mesma troca
   na navegação: `repouso` ↔ fase crua num quadro, na saída e na volta.
2. **Entrada re-disparada por dependência de dado.** `Reveal`, `Alive` e `Drain` tinham
   `index`/`preso` nas dependências de um efeito que começa com atribuição CRUA a zero:
   dado chegando depois teleportava o cartão assentado e o reanimava. `Mosaic` e o
   assistente faziam o mesmo por outro caminho — chave que muda de valor é remontagem.
3. **Altura de layout animada.** `Bars` e o pote da capa animavam `height` para sempre; o
   Yoga arredonda para o pixel físico, então varrido contínuo anda em degraus.
4. **Duas molas na mesma subárvore.** O `CollapsingHeader` declarava o embrulho duplo
   defeito e o cometia em dois dos três caminhos.

**O que a leitura ensinou sobre método:** o docblock que NOMEIA o defeito não impede o
defeito. O `vida.ts` prometia *"sem volta não há salto"* doze linhas acima de
`relogio.value = 0`; o `CollapsingHeader` chamava o embrulho duplo de defeito e o fazia; a
`Peca` afirmava que o salto não acontece. Três promessas escritas, três códigos fazendo o
contrário no mesmo arquivo. Promessa em docblock é o que a guarda deveria medir — e para
o relógio, a `Peca` e o embrulho não havia guarda nenhuma.

**E uma correção ao meu próprio conserto de duas horas atrás:** a espera de 400 ms que pus
no `useNaTela` resolvia a SAÍDA e não a VOLTA. A mistura de 350 ms entre repouso e fase
dentro do `useCiclo` resolve as duas com um mecanismo só, e a espera saiu no mesmo dia em
que entrou.

## 12 de setembro — o teste que exigia o defeito

`compareVersions` arredondava duas vezes: `cents(depois) - cents(antes)`, dois erros de meio
centavo entrando numa subtração. Uma ficha que foi de 7,3265 para 7,0 centavos por unidade —
três décimos mais barata — saía com delta **zero**, e a tela dizia "não mudou" de uma decisão
que mudou.

O que torna este achado diferente é a régua: existia um teste, e ele **exigia** o defeito.
A linha era `assert.ok(Math.abs(percent - deltaCents / antes) < 1e-12)` — o por cento
comparado com o delta ARREDONDADO, os dois lados vindos do mesmo número. Qualquer
implementação que arredondasse duas vezes passava; a implementação certa **reprova**. Foi
o que aconteceu ao consertar: 781 verdes viraram 780 e a falha era o conserto.

É a armadilha que esta casa já pagou uma vez — `taxa` comparada com `(taxa - 0,4) + 0,4` —
e ela tem a mesma assinatura: `Math.abs`, tolerância, duas variáveis, cara de igualdade de
verdade. **A pergunta que a desmonta é sempre a mesma: de onde veio o valor comparado?** Se
veio do valor testado, não há teste — há uma tautologia com tolerância.

E há um segundo ensinamento, sobre ordem: eu descobri isso porque o conserto QUEBROU a
suíte. Um teste que falha ao consertar um defeito é informação de primeira qualidade, e o
reflexo errado é ajustar o teste para voltar ao verde. O certo é ler o que ele afirma — e
ali ele afirmava o defeito, por escrito, com um comentário elogiando a própria régua.

## 12 de setembro — apagar também é conserto: a primitiva que prometia o que não cumpria

`multiplyCents` e `toDecimal` estavam na lista de exportações sem chamador, cada uma com a
justificativa escrita. Medidas pelo CONCEITO em vez do símbolo, as duas eram falsas — e em
direções opostas:

- `toDecimal` ("existe para ninguém dividir por 100 na mão") tinha um chamador o tempo todo:
  `formatMoney`, a função de dinheiro mais chamada do aplicativo, fazia `cents / 100`.
- `multiplyCents` ("existe para ninguém escrever `Math.round(x * f)` inline") não tinha uso
  nenhum, e o inline que ela alegava impedir — vinte e cinco ocorrências — é `Rate ×
  quantidade`, que é trabalho do `amountOf`. Ela protegia uma operação que este código não
  faz.

A primeira ganhou o chamador; a segunda foi apagada. **A lição é que "primitiva certa
presente impede a errada de nascer" é falso** — foi escrito como justificativa e desmentido
por vinte e cinco linhas. O que impede inline é guarda de fonte, não disponibilidade.

*E o P1 me pegou no mesmo commit, o que é a régua funcionando: criei `rateToDecimal` e
`countsFromTiers` e a suíte reprovou com "sem chamador" antes de eu ligá-las. A regra vale
para quem a escreveu.*

## 12 de setembro — a mesma dívida em três seções, e três leitores a acharam três vezes

O estudo de oito frentes devolveu 145 itens de pé, e ao ordená-los apareceu um padrão que
não é sobre nenhum deles: **a mesma dívida mora em vários lugares do plano.** O item 42 (a
falta que entra como venda) está escrito em três seções; a conferência duplicada, em
quatro; o estado do Reset, em três. Leitores diferentes, lendo frentes diferentes, a
acharam como se fossem itens distintos — e teriam produzido três consertos da mesma coisa.

**O custo não é a duplicação: é a divergência.** Três cópias envelhecem em três ritmos, e a
que alguém ler primeiro decide o trabalho. Foi exatamente o que aconteceu nesta rodada com
números menores: o padrão da capa dizia "oito" em dois parágrafos e o código tem **nove**;
o topo do plano dizia "21 telas" enquanto a guarda deriva **36**; o cabeçalho do `db.ts`
prometia "duas diferenças" e o corpo tem **cinco**; o `needsHumanYes` dizia que preço e
estorno "cannot yet do at all" e os dois existem há dias; o `enviar` dizia "nunca acontece
sozinho" quatro dias depois de o automático virar regra.

Cinco documentos, cinco mentiras, e **nenhuma delas é descuido**: todas nasceram verdadeiras
e ficaram para trás quando o código andou. A regra que este projeto já tem para o plano —
`<!-- medida: -->` que a suíte roda — existe justamente por isso, e não alcança docblock.

A consequência prática, e ela é de método: **número em prosa que não sai de um `grep` é
lembrança.** Quando um documento afirma uma contagem, ou ele deriva (e aí a guarda o
protege), ou ele diz de qual dia é a medida. E uma dívida tem um lugar; as outras citações
apontam para ele.

## 12 de setembro — o estudo disse "defeito de dinheiro" e a medida disse "não"

O estudo de oito frentes apontou `rate(input.totalCents / 100, input.baseUnits)` no escritor
da compra: dividir por 100 para a função multiplicar de volta, com a taxa **congelada** do
razão saindo dessa volta. A frase do item era *"a taxa congelada passa a ser a divisão
exata"* — que sugere que hoje ela não é.

Medi antes de consertar, que é a regra desta casa, e a resposta foi metade: **as duas formas
diferem em 6,7% de ~314 mil pares** (um a dois mil reais contra onze quantidades reais) — e
sempre na décima quinta casa decimal, erro relativo de 1e-15. O efeito em dinheiro é
**zero**: R$ 118,35 por 25 kg dá os mesmos 473.400 centavos por tonelada dos dois jeitos.
Nenhuma quantidade que uma fábrica movimenta muda um centavo.

Fiz a troca assim mesmo, e é aí que está o achado: **o motivo certo não era o que o item
dizia.** `rateFromCents(total, quantidade)` é a definição de taxa nesta casa — centavos por
unidade-base — e `rate(preço, unidades)` recebe REAIS, porque existe para o campo em que
alguém digita. Passar centavos divididos por 100 para a segunda atravessa a fronteira que os
dois tipos existem para guardar, e quem lê depois procura uma conversão de moeda que não há.

**A lição é sobre relatório de auditoria, inclusive o meu.** Um item que diz "isto está
errado" com o arquivo e a linha certos pode estar certo sobre o CHEIRO e errado sobre a
CONSEQUÊNCIA — e consertar citando a consequência errada planta no repositório uma
afirmação falsa com cara de medida. Este projeto já passou perto disso uma vez
(*"quase publiquei um defeito de escala que não existe"*, `formatUnitRate`). A régua: antes
de escrever o docblock do conserto, rode a conta nos dois caminhos e veja se o número muda.

*E ficou anotado o risco que a medida NÃO descarta: a garantia 6 compara a média do aparelho
com a do servidor. Enquanto houver tolerância, 1e-15 não importa; no dia em que alguém
comparar por igualdade exata, dois caminhos aritméticos para o mesmo número é como isso
quebra.*

## 12 de setembro — o conserto que não alcançou o lugar citado pelo próprio conserto

`formatDecimal` existe por um defeito nomeado no docblock dela: o rascunho da produção
falada dizia *"em 395.26 vezes"* — ponto decimal cru, em português, na folha que a pessoa
confirma antes de o razão receber a linha. E `src/assistant/skills.ts` continuava escrevendo
`Number(batches.toFixed(2))` **naquela mesma frase**. A função nasceu para o sítio, foi
usada em dois vizinhos dele, e o sítio ficou.

Junto vieram duas irmãs, e a primeira é pior que cosmética: a tela da ficha lia a perda com
`toFixed(2)`, então **2,535% reabria como 2,54%** e salvar sem tocar em tecla nenhuma
gravava 0,0254 por cima de 0,02535 — a tela corrompendo o cadastro ao abri-lo. O comentário
três linhas acima conta essa história inteira… para o SEPARADOR, consertado semanas antes.
O mesmo defeito, o mesmo arquivo, a mesma função, e a segunda metade passou.

**O que `toFixed` tem de especial é que ele faz duas coisas de uma vez** — escreve o ponto
decimal do JavaScript e TRUNCA —, e um conserto motivado pela primeira não olha a segunda.

A guarda nova (`casasNaMao`) cobre as duas, e foi provada nas três formas REAIS que estavam
no disco mais a prosa de docblock que cita o padrão. Ela é irmã da régua de porcentagem que
já existia — e é aí que está a lição: **a régua antiga exigia `%` na mesma linha**, de
propósito e com razão escrita, e isso a cegava para os outros três rostos do mesmo defeito.
Régua estreita demais não é conservadora: ela é uma promessa de cobertura que não cobre.

## 12 de setembro — o levantamento achou 27; a guarda achou 30

`amountOf` diz de si *"the one place rounding happens"*, e o repositório tinha **trinta**
lugares fazendo a conta dela à mão: dezessete multiplicando taxa por quantidade, dez
arredondando uma taxa direto para dinheiro, e três que **o meu levantamento não pegou**.

O levantamento foi um `grep` de `Math.round(` filtrado por palavras que eu achei que
apareceriam — `rate|custo|cost|preco|price|cents|valor`. Os três que escaparam eram
`parsed.unitRate` e `cost.perYieldUnit` dentro de `formatMoney(...)`: a linha tem taxa e
tem dinheiro, e nenhuma das minhas palavras estava nela em minúscula. **A guarda, que mira
o NOME do identificador (`\w*Rate`, `perYieldUnit`), achou os três em um segundo.**

É a regra da casa sobre detector descartável, com o sinal trocado: ali o perigo é a régua
de uma vez que erra e fala direto com o dono. Aqui é o oposto e vale escrever — **a régua
que vai virar guarda encontra o que a varredura à mão perdeu**, porque ela é escrita para
o conceito e a varredura é escrita para o que a memória lembrou de procurar. Se o plano
diz "são 25", a guarda é que decide.

Nenhum dos trinta estava errado hoje. O que eles tornam possível amanhã é o defeito: com o
arredondamento em trinta lugares, o dia em que um deles arredondar antes de somar em vez
de depois não aparece em teste nenhum — aparece num total que ninguém explica meses depois.

## 12 de setembro — a guarda e o defeito concordavam

`ESCRITORES_COM_SALA` cobra das telas que elas digam em que sala estão gravando no razão. A
lista tinha três nomes — `recordLoss`, `recordCount`, `recordProduction` — e o quarto
escritor, `recordPurchase`, ficava de fora. Não por esquecimento: **ele não aceitava sala.**
A régua não tinha o que cobrar dele, e o verde dela era verdadeiro e completamente vazio
sobre o caminho que mais importa numa fábrica com duas unidades.

O efeito: toda compra caía em `ensureLocation(companyId)`, o almoxarifado da PRIMEIRA
unidade. Com uma unidade só — todas até hoje — os dois ids são o mesmo e nada aparece. Na
segunda, a nota digitada lá dentro some: o saldo cresce a centenas de quilômetros de onde o
caminhão descarregou, e quem está com o saco na mão conta falta.

**A regra que sai é sobre a forma da lista.** Uma guarda cuja lista é derivada do que o
código ACEITA não guarda o que o código DEVERIA aceitar — ela vira um espelho, e espelho
não é régua. A pergunta certa ao escrever uma lista dessas é a do conceito: *quais atos
escrevem no razão?* São quatro. Se um deles não tem como dizer a sala, isso é o achado, não
a razão de excluí-lo.

*É a irmã da cicatriz do `daysUntilExpiry` (justificativa de ausência medida pelo símbolo
em vez do conceito) e da régua de porcentagem cega para três dos quatro rostos do mesmo
defeito. Três formas diferentes da mesma doença: a régua desenhada a partir do estado atual
do código em vez do que o código promete.*

## 12 de setembro — o assistente lia o razão num fuso e escrevia a frase noutro

`app/assistant.tsx` montava o contexto com `data: liveData(empresa, locale.timeZone)` e
`locale: defaultLocale` — **a mesma tela, duas fontes de fuso, na mesma expressão.** A
camada de dados recebia o fuso da fábrica e as frases eram montadas com `America/Sao_Paulo`
cravado. `dayWindow(nowIso(), ctx.locale.timeZone)` aparece em quatro lugares do
`skills.ts`, então às 3h30 UTC o assistente responderia *"hoje saíram 400"* de um dia
diferente do que toda outra tela chama de hoje — em São Paulo já é hoje, em Manaus ainda é
ontem.

**O que fazia isso parecer certo era uma decisão de verdade lida larga demais.** O
assistente está congelado até o áudio existir, e o congelamento diz *"nada de tradução das
respostas"*. `defaultLocale` é o objeto que carrega o idioma — e carrega junto fuso e moeda,
que **não são idioma**. Um objeto que agrupa "como se escreve" com "onde a fábrica fica" faz
uma decisão sobre a primeira metade valer silenciosamente para a segunda.

A regra que sai: **quando uma decisão congela um ASPECTO, o congelamento não pode ser feito
congelando o objeto inteiro que contém aquele aspecto.** Aqui o conserto é literalmente um
espalhamento — `{ ...defaultLocale, timeZone, currency }` —, e ele deixa visível o que está
cravado e o que não está.

*E a moeda tinha o mesmo defeito, com a consequência pior: quem paga em pesos via "R$" numa
conta certa. Número certo com o símbolo errado é pior que número errado, porque parece
confiável.*

## 12 de setembro — as guardas desenharam a descida melhor do que eu

A sincronia deixou de ser de mão única, e o caminho até lá foi guiado por quatro guardas que
reprovaram o meu primeiro desenho. Nenhuma delas estava reclamando de estilo:

1. **`only the data layer speaks SQL`** pegou `src/sync/descida.ts` construindo `INSERT`.
   A saída óbvia era pedir exceção — o estudo até previa isso. A saída certa era **mover**:
   as regras da descida (ordem, cursor, pedido) ficam em `src/sync`, e o SQL foi para
   `src/data/descida.ts`. A guarda não estava no caminho; ela estava apontando a costura.
2. **`the crossing reads the stored row, never a repository read`** pegou o motor da
   descida importando `recomputeItemCost`. A fronteira que ela guarda é o *import*, não a
   direção — e estava certa mesmo sendo aquilo uma escrita.
3. **O P1** reprovou `descida.ts` inteiro por exportar sem chamador, antes de eu ligar o
   motor. Meia rodada não passa.
4. **`every server column with a written rule reaches the device`** pegou `received_at`: o
   servidor ganhou a coluna com `comment on column` e o aparelho não a tem. Ela é
   deliberadamente só do servidor — o cursor mora uma vez por TABELA no `app_meta`, não uma
   vez por linha — e a guarda exigiu essa frase por escrito, que é exatamente o que ela
   deveria exigir.

**O que isso ensina sobre guarda boa:** as quatro dispararam num desenho que compilava,
passava nos testes e funcionava. Elas não mediram o resultado — mediram a **forma**, e a
forma errada é o que fica caro depois. Uma suíte que só olha resultado aprova qualquer
arquitetura que dê o número certo hoje.

*E uma quinta, menor, que também vale: o teste da ordem da rodada automática afirmava
`feito[1]` e `feito[2]`. A peça nova entrando no meio o quebrou sem que nada sobre o que ele
afirma tivesse mudado — asserção posicional numa lista que cresce é asserção sobre a ordem do
arquivo, não sobre a regra. Virou busca por nome.*

## 12 de setembro — o cursor que só um Postgres de verdade sabe provar

A descida precisa de um cursor, e a escolha dele é toda sobre relógios: `occurred_at` chega
fora de ordem de propósito (a nota de terça digitada na quinta) e `recorded_at` vem do
aparelho — dois celulares com relógios diferentes embaralham a ordem, e um relógio atrasado
faz linhas nascerem ANTES do cursor de quem já sincronizou, invisíveis para sempre. Daí
`received_at default now()`, a hora do servidor.

**O que quase escapou foi o desempate.** Uma fila subindo em lote entra numa transação só, e
dentro de uma transação `now()` é o MESMO para todas as linhas. Com o cursor em
`received_at > X` apenas, a segunda e a terceira linha do lote ficam do lado errado do "maior
que" e somem — caladas, para sempre, exatamente nos movimentos mais novos.

Isso não é demonstrável em teste de unidade: depende de o Postgres dar o mesmo `now()` dentro
da transação. A garantia 33 planta três movimentos num `begin/commit`, **confere que os três
compartilham o relógio** (senão a garantia estaria provando outra coisa) e então prova que o
par `(received_at, id)` atravessa o lote inteiro. Plantado o cursor sem desempate, ela
reprova dizendo *"sem o desempate, um lote inteiro some depois da primeira linha"*.

**A régua que sai: quando a correção depende de uma propriedade do BANCO — mesmo `now()`
numa transação, ordem de gatilho, tradução de SQLSTATE — a prova tem de rodar contra o banco.
E a garantia precisa checar primeiro que a propriedade vale**, senão ela passa verde medindo
um caso que não aconteceu.

## 12 de setembro — a garantia que passava verde porque media permissão, não arbitragem

A decisão do dono é *"o primeiro que aceitar fica"*. A `0062` a impõe onde ela não pode ser
burlada: a política de `update` tem `using (resolution is null)`, então linha decidida deixa
de ser visível para escrita — a segunda aceitação não erra, ela alcança **zero linhas**.

Escrevi a garantia 34 para provar isso: primeira conta aceita (1 linha), segunda conta aceita
(0 linhas), e a decisão da primeira fica gravada com o nome dela. Verde. Então plantei o
defeito que ela nomeia — tirei `resolution is null` do `using` — e **ela continuou verde**.

A causa é a mais antiga deste caderno com um rosto novo: as duas contas tinham capacidades
**diferentes**. A segunda era o `OWNER`, que tem `view_cost`, `manage_company` e
`record_production` — e não tem `adjust_stock`. O zero não vinha da arbitragem; vinha da
permissão. A régua estava medindo a coisa certa pelo motivo errado, e teria aprovado para
sempre uma política sem condição nenhuma.

O conserto tem duas partes, e a segunda é a que vale:

1. uma **segunda conferente** com a MESMA capacidade da primeira, para `resolution` ser a
   única variável entre as duas aceitações;
2. um **caso de controle**: a segunda conta aceita uma candidata NOVA, sem decisão, e tem de
   conseguir. Sem ele, "zero linhas" continua tendo duas explicações — e é o caso de controle
   que denuncia quando a explicação muda.

*E o injetor falhou em silêncio no meio disso, o que dobra a lição:* a primeira tentativa de
plantar o defeito não plantou nada (aspas aninhadas num `python -c` dentro do shell), e o
`grep` que eu rodei para conferir contou **a prosa do docblock que cita o padrão** — dois
verdes seguidos, nenhum medindo nada. A regra desta casa já manda conferir a injeção no
disco; falta a metade que eu aprendi agora: **confira o que a linha de CÓDIGO diz, não quantas
vezes o texto aparece no arquivo.**

## 12 de setembro — arbitragem é permissão sobre o tempo

O desenho inicial do *"primeiro que aceitar"* era `update check_candidates set resolution =
...` no aplicativo. Sem condição, dois celulares aceitando no mesmo minuto gravam os dois e o
**último** vence — o contrário exato do pedido: não fica o primeiro, fica o mais lento.

Pôr a condição no cliente (`where resolution is null`) conserta o caso honesto e não o caso
que importa: o cliente está do lado de fora da fronteira. A fundação desta casa já diz que
**permissão mora na consulta, nunca numa instrução** — e a percepção que faltava é que
arbitragem é uma forma de permissão: *quem pode escrever esta linha* deixa de depender só de
QUEM e passa a depender de QUANDO.

`using (resolution is null)` na política diz as duas coisas com a mesma gramática. E o `with
check` ao lado fecha a outra metade — sem ele, um `update` mudaria `first` para `second`
dentro da mesma requisição em que a linha ainda parecia livre.

## 13 de setembro — exatamente-uma-vez só existe onde a arbitragem já é exatamente-uma-vez

A rodada anterior deu ao *"primeiro que aceitar"* uma política (`using (resolution is null)`), e
eu escrevi a metade seguinte no aparelho: quem decide estorna a conferência que perdeu e manda o
estorno. Fui escrever a guarda e a sequência não fecha, com dois celulares:

1. o celular A aceita a candidata de B e sobe o estorno;
2. a decisão **desce** para B;
3. B roda a mesma regra, olha um razão onde o estorno de A ainda não chegou, e estorna a mesma
   linha de novo.

Duas subtrações da mesma quantidade, as duas linhas legítimas, cada uma apontando para a origem
certa, e nada reclamando. **Nenhuma quantidade de idempotência no aparelho resolve isso**, e é
essa parte que vale registrar: a pergunta *"alguém já estornou?"* é respondida por um razão que
ainda não desceu. Idempotência precisa de um ponto onde a resposta seja definitiva, e num
sistema que sincroniza esse ponto não está no cliente.

O único lugar onde *uma vez* já é verdade é a transação que ganha o `using (resolution is
null)` — por construção, exatamente uma passa. Escrever a consequência lá dá as duas coisas de
graça: a segunda aceitação não alcança linha nenhuma, então ela também não estorna nada. A
generalização: **não procure onde pôr a trava; procure onde a trava já existe, e pendure a
consequência nela.**

*E o `security invoker` do gatilho não é detalhe de implementação — é a prova de que ele não é
uma porta de lado.* Escrevendo com os privilégios de quem aceitou, ele não consegue gravar nada
que a pessoa não pudesse gravar sozinha. Isso obrigou a fechar `resolved_by`, que a `0062`
deixava livre: no instante em que um gatilho LÊ uma coluna do cliente para carimbar `recorded_by`
no razão, aquela coluna deixa de ser dado e passa a ser assinatura.

## 13 de setembro — o escritor sem exercício não é código, é promessa

A metade do aparelho desta mesma rodada foi escrita, compilada, lintada e passou por 788 testes
verdes carregando **quatro** defeitos, três deles silenciosos no celular de quem usa:

| onde | o defeito | o que aconteceria |
|---|---|---|
| `candidata.ts` | `SELECT … recorded_by FROM movements` — coluna que a **V5 removeu** | o `SELECT` quebra, o `try/catch` do motor engole, a candidata **nunca** é gravada |
| `serialize.ts` | nenhuma travessia para `check_candidates` | a primeira duplicação **emperra a sincronia daquele celular para sempre** — ver a correção abaixo |
| `descida.ts` | a tabela não estava em `DESCEM` | o segundo celular nunca vê a disputa — metade da decisão do dono |
| a decisão | nenhuma consequência no razão | aceitar mudava uma coluna e o saldo continuava dobrado |

Os quatro moram em quatro arquivos, e **o único lugar de onde eles se veem juntos é um teste que
anda o caminho inteiro** — gravar a conferência, candidatá-la, serializar a linha, honrar a
decisão, e olhar o SALDO no fim. `typecheck` não alcança nenhum: os três primeiros são nomes que
existem (uma coluna que o SQLite só recusa em tempo de execução, uma tabela que é `string` na
fila, uma lista que é só um array).

A regra que sai daqui é a irmã do portão P1. P1 pergunta *quem chama isto?* e os quatro tinham
chamador. A pergunta que faltava é **quem EXERCITA isto?** — e ela se responde com um teste que
percorre o caminho, não com um que visita as funções.

## 13 de setembro — a régua que lê o esquema tem de ler a forma que o banco aceita

Três guardas de `agreement.test.ts` comparam o que o aparelho manda com o que o servidor exige,
lendo o SQL das migrações. O padrão era `/create table (\w+) \(/`, e a `0062` criou
`check_candidates` com `create table **if not exists**` — a forma que migração idempotente usa.
A tabela ficou **invisível** para as três guardas por um dia inteiro.

Não deu falso verde por sorte de escopo (a travessia dela ainda não existia, então nada havia a
conferir); no instante em que a travessia foi escrita, a guarda gritou *"o servidor não tem
check_candidates"* — **falso**, e com cara de achado. A régua que não lê a forma que o banco
aceita mede um esquema que não existe, e o erro dela chega como acusação contra o código certo.

E o conserto abriu o segundo, da mesma família: pular a linha que começa com `constraint` não
basta, porque restrição de tabela ocupa **mais de uma linha** — a continuação `or (resolution is
not null …)` foi lida como uma coluna chamada `or`. A leitura passou a contar parênteses, que é
a única que não depende de como alguém quebrou a linha.

## 13 de setembro — a checagem mediu o dia num relógio e o aplicativo no outro

Uma checagem de navegador reprovou com *"no domingo quieto, a capa diz que não produziu"*, e a
capa estava certa. Ela pergunta `new Date().getUTCDay()` — o relógio do **Node** — e dá ao
navegador `timezoneId: 'America/Sao_Paulo'` três linhas antes. Entre 00h e 03h UTC os dois
discordam: às 00h07 de 13 de setembro o Node dizia domingo e o aplicativo, certíssimo, contava
o sábado.

O comentário dessa checagem diz que ela usa *"a MESMA regra do simulador"*, e o simulador lê o
dia de `dayWindow(hoje, fuso)` — não de `new Date()`. As duas coincidem em vinte e uma das vinte
e quatro horas, e é por isso que ela sobreviveu: a janela de erro é de três horas por dia, e só
fica **visível** quando essas três horas atravessam a fronteira de um domingo — seis horas por
semana.

O aplicativo já tinha a lição escrita, em `app/(tabs)/index.tsx`: *"o dia da semana no fuso da
FÁBRICA: ler o dia do relógio do aparelho dá o dia errado."* A checagem escrita para honrar o
domingo do simulador quebrava exatamente a regra que ela existe para honrar. **Quando a checagem
e o código calculam o mesmo conceito por caminhos diferentes, o intervalo em que eles discordam
é o tamanho da mentira** — e ele não aparece no verde.

*E a outra metade desse mesmo achado, que é quase bonita:* as duas confirmações da tela já
prometiam, em três idiomas, exatamente o que faltava — *"a conferência guardada será desfeita
por estorno e a sua entra no lugar"* e *"a sua conferência de {{amount}} será desfeita"*. O
texto foi escrito antes do mecanismo e nomeava as duas coisas que não existiam. **A frase da
confirmação é a especificação mais precisa que este projeto produz**, porque ela é a única que
alguém tem de escrever pensando no que vai ACONTECER, e não no que vai ser gravado. Quando ela
mente, o defeito está no código; quando ela é vaga, o desenho ainda não foi decidido.

### Correção, no mesmo dia, e ela é a lição da lição

Escrevi acima que a travessia ausente fazia `UnknownTableError` **derrubar a rodada**. Fui ler
`src/sync/transporte.ts` para a rodada seguinte e não é isso: o laço embrulha `linhaDaFila` e
`serialize` num `try` cujo `catch` é um `break` mudo. Então nada é derrubado — a fatia volta com
menos aceitos, o motor lê `confirmed + deLado < batch.length` como **lacuna do servidor**,
gasta tentativa, espera, e repete. Para sempre, porque nenhuma quantidade de retentativa
conserta uma falha que é do aparelho.

O efeito final é o mesmo (aquele celular para de sincronizar) e **a causa relatada é falsa**: a
tela diz *"o servidor aceitou N de M registros"* quando o servidor não recusou nada — ele nunca
foi consultado sobre aquela linha. Quem for depurar isso vai olhar o servidor.

Esta casa já tem a regra: *"um item de auditoria pode estar certo sobre o cheiro e errado sobre
a consequência, e escrever a consequência errada num docblock planta uma afirmação falsa com a
cara de uma medida."* Eu a quebrei na mesma rodada em que a citei — e o que me pegou não foi
reler o que escrevi: foi **ir construir a coisa vizinha**. A verificação que funciona não é
olhar de novo o próprio texto; é o texto precisar ser verdade para a peça seguinte funcionar.

## 13 de setembro — canário e asserção fraca são a MESMA sintaxe, e só a semântica separa

Varri os testes procurando `assert.ok(x > 0)` — a cicatriz dos R$ 625,27, em que a asserção
tinha a explicação certa ao lado e não checava nada. A régua achou 38, e ela estava errada
duas vezes antes de dizer um número:

1. contou **prosa de docblock** que CITA o padrão para explicá-lo, em dois arquivos. É a
   cicatriz já escrita neste projeto, cometida de novo: falar de uma coisa não é fazê-la;
2. não distinguia o **canário** da asserção fraca — `assert.ok(chamada > 0, 'sem isso esta
   guarda mede o vazio')` não afirma nada sobre dinheiro, ele prova que a medida ABAIXO tem
   sobre o que medir, e nesse papel "maior que zero" é a pergunta exata.

Refinei por "tem mensagem?", caí de 38 para 4 — **e o refinamento teria perdido a cicatriz que
originou a regra.** O `assert.ok(valor > 0)` dos R$ 625,27 TINHA mensagem, e certa. Então
"tem mensagem" separa canário de fraca em alguns casos e mente nos outros.

O que separa de verdade não é sintaxe: é se o número é **calculado** (dinheiro, taxa, saldo,
parcela) ou **estrutural** (a varredura achou algo? a fila tinha linha?). Filtrando por isso,
38 viraram 5, e das 5 três são legítimas por construção — *"não é zero"*, *"subiu"*, e um
canário cuja igualdade de verdade está duas linhas abaixo.

Sobrou **uma**: `src/data/repository.test.ts:227`, `assert.ok(errada.newRate > 0);` nua, num
teste onde a compra CERTA logo acima é conferida por igualdade contra um número na mão
(*"R$ 4,72 o quilo"*). A nota errada — dez sacos pelo preço de dez quando chegou um — merece a
mesma régua que a certa.

**A regra de método que sai daqui, e ela é sobre réguas descartáveis em geral:** quando a
distinção que interessa é semântica, a régua não decide — ela ESTREITA. Dizer "4 defeitos"
depois de um filtro sintático seria a mesma promessa falsa que a asserção fraca; o número
honesto veio de filtrar pelo que o número É, e depois ler as cinco.

## 13 de setembro — a guarda que olha o último elo não vê a frase que entrou dois elos antes

`src/layers.test.ts` tem uma guarda chamada `frasesCruas`: ela recusa tela que imprima
`e instanceof Error ? e.message : …`. Ela nasceu de nove telas fazendo exatamente isso, e está
certa. E o motor da fila escrevia, dentro de si:

```ts
error = e instanceof Error ? e.message : String(e);
```

Exatamente o padrão que ela nomeia, no arquivo onde ela não olha — e a frase não morria ali:
ela viajava até `app/settings.tsx` dentro de um campo do relatório e era interpolada crua em
*"Parou no meio: {{reason}}"*. A guarda estava verde porque a **tela** não tinha o padrão. O
padrão estava dois elos antes, e a frase chegava ao mesmo lugar.

Do lado de cima do mesmo campo havia a irmã: o motor montava *"O servidor aceitou 3 de 100
registros."* em português — e AFIRMAVA o servidor. Uma falha do próprio aparelho (linha que
sumiu, tabela sem travessia) chegava ao dono como recusa de quem nunca foi consultado. Duas
fundações quebradas na mesma linha: *a camada devolve fato, não frase* e *i18n desde o
primeiro texto*.

**A régua que sai daqui:** quando uma guarda proíbe um padrão NA SAÍDA, ela tem de perguntar
também de onde o valor veio. Frase não precisa ser impressa onde nasce para chegar aos olhos de
quem usa — basta um campo que atravesse. E a forma de fechar isso não é ampliar o `grep`: é o
TIPO. `SyncReport.error` deixou de ser `string` e virou fato (`motivo`, `aceitos`, `de`,
`codigo`, `cru`), e aí o compilador achou os três leitores — a tela, o painel do aparelho e
dois testes — em vez de eu ter de procurá-los.

*E o painel do aparelho era o terceiro defeito, escondido no segundo:* `src/nuvem/aparelho.ts`
lançava `{ motivo: 'servidorRecusou' }` para TODA parada, com um comentário em prosa dizendo o
mesmo — enquanto a parada podia ser falta de sinal. Uma constante cravada onde devia haver um
dado lido, e o comentário ao lado a confirmando. Foi o typecheck que o entregou.

## 13 de setembro — retentativa não conserta o que não é do servidor, e a fila não sabia disso

`src/sync/recusa.ts` decide se uma recusa é para sempre ou para agora, e o padrão dela é
*"para agora"* — com uma assimetria de custo escrita e certa: classificar passageira como
permanente perde dado em silêncio; classificar permanente como passageira trava a fila, que é
ruim e visível.

O que ela não cobria é a falha que acontece **antes** de o servidor ser consultado. O
transporte monta a linha primeiro, e isso falha de duas formas: a linha sumiu do aparelho, ou a
tabela não tem travessia. As duas chegavam ao motor sem código nenhum, caíam no padrão
"passageira", e eram retentadas com espera exponencial **para sempre** — porque nenhuma
quantidade de retentativa faz existir uma linha que não existe.

A assimetria de custo não se aplica aqui, e é isso que destrava a decisão: pôr de lado **não
apaga** — a linha fica no aparelho com o motivo ao lado e a tela a mostra. O que se perde é uma
retentativa que não tinha como funcionar; o que se ganha é a fábrica voltar a sincronizar em vez
de parar por uma linha.

**E a visibilidade obrigou uma coluna.** Quando a falha local sai da frente, a fatia FECHA — o
motor não relata parada nenhuma, e é correto. Então o aviso não pode morar no relatório da
corrida: ele mora no registro do que ficou de lado. Sem uma coluna que diga "foi o aparelho", a
tela de "o que ficou de lado" explicaria *"o servidor já tinha este registro"* sobre uma linha
que ele nunca viu — o mesmo defeito de atribuição, uma camada abaixo. Isso é a V36.

## 13 de setembro — detalhamento que não SOMA é pior que detalhamento ausente

A Lei 6 desta casa diz que toda conclusão abre a conta. Três respostas do assistente traziam um
total e um detalhamento embaixo, e em nenhuma das três as linhas somavam o total:

| resposta | manchete | detalhamento |
|---|---|---|
| `listInputs` | soma de taxa × saldo | preço por **1.000 unidades** |
| `whatWasLost` | total de 30 dias | as **cinco primeiras** perdas |
| `stockAtPlace` | valor somado no fim | só quantidade, **sem parcela** |

Nenhum dos seis números está errado. O defeito é de **relação**: o detalhamento tem a FORMA da
conta e não é a conta. Quem confere de cabeça — que é exatamente quem a Lei 6 serve — não fecha,
tenta duas vezes, desiste, e passa a desconfiar também dos números que estão certos. Um total
sozinho pede confiança e é honesto sobre isso; um total com parcelas que não somam pede confiança
fingindo prova.

E o corte das cinco primeiras é a mesma doença com uma agravante que este projeto persegue em
toda parte: **truncamento silencioso**. Com doze perdas, cinco linhas somavam R$ 26,40 de
R$ 27,00 e nada dizia que faltava linha.

*O material para consertar as três já estava no lugar, sem ser usado:* `porMotivo` era calculado
três linhas acima só para achar o pior, e `valueCents` já vinha por linha do `stockByPlace`. Não
faltava dado nem cálculo — faltava a pergunta *"quem somar isto chega no número de cima?"*

**A régua que sai daqui é a asserção, não a leitura:** a soma das parcelas contra a manchete, que
é igualdade contra outra fonte. Um `assert.ok(detail.length > 0)` diria que há detalhamento — e
foi exatamente o que existia, verde, enquanto a conta não fechava.

## 13 de setembro — o manifesto que importa é o MESCLADO, e eu medi o de origem

Fui conferir a queixa de que o APK declarava "32 permissões, 5 usadas". Li
`android/app/src/main/AndroidManifest.xml`, contei **seis**, e relatei ao dono que o número do
estudo havia envelhecido. Estava errado: o APK declarava **trinta e uma**.

O manifesto de origem é **entrada** da mesclagem, não a resposta. O gradle junta o que cada
biblioteca pede, e o que instala no aparelho é a soma: contador no ícone para oito marcas de
lançador, biometria, partida do sistema, FCM, referência de instalação da Play. Vinte e cinco
permissões que nenhum arquivo do projeto menciona, e que aparecem na listagem de loja.

A régua certa é `aapt dump badging` **no artefato**. É a mesma família de erro que este projeto
já registrou três vezes hoje: medir o lugar onde a coisa é escrita em vez do lugar onde ela é
lida. E a versão desta é pior, porque o repositório parece certo: quem confere o `app.json` vê a
configuração boa e o aparelho de outra pessoa tem outra.

**O que a medida rendeu:** 31 → 10 permissões, e cada uma das dez com dono nomeado — câmera na
etiqueta, háptico no botão, agendamento do aviso de validade, sincronia, cópia de segurança. As
vinte e uma bloqueadas têm ausência de uso MEDIDA, não suposta: nenhum `setBadgeCountAsync`
("badge" aparece como nome de estilo de um cartão), nenhuma linha de biometria, e nenhum
`google-services.json` — sem ele o FCM não está configurado.

**E a guarda tem os DOIS lados, o que é o achado de método.** Uma lista de bloqueio cresce por
higiene, e higiene levaria `RECEIVE_BOOT_COMPLETED` e `WAKE_LOCK` junto — que é o que faz o aviso
de validade sobreviver ao reinício do tablet e acordar para disparar. O alerta que salva
mercadoria sumiria sem nada reclamar. Então a guarda afirma o que tem de SAIR e o que tem de
FICAR, e a segunda metade é a que impede o conserto de virar o defeito seguinte.

## 13 de setembro — o APK saía com o manifesto de cinco dias antes

`android/` é saída do `expo prebuild` e está no `.gitignore`. O `compilar` do
`scripts/aparelho.mjs` rodava o gradle direto, sobre o que estivesse no disco — e o que estava
era o resultado de um prebuild de 8 de setembro. Desde então o `app.json` mudou: canal de
atualização, `allowBackup`, permissão bloqueada, `versionCode`.

Os dois APKs que foram para o tablet do dono carregavam `updates ENABLED=true` e
`CHECK_ON_LAUNCH=ALWAYS` — o contrário do que o `app.json` diz — e `versionCode 1`, porque a
fórmula do código vivia só no `build-apk.yml` e o caminho local não passava nada. **Dois APKs com
o mesmo `versionCode` não são atualização para o Android**: são duas builds com o mesmo nome, e o
aparelho não sabe qual é a nova.

Hoje `compilar` gera o `android/` antes de compilar, e `conferirAPK` lê o artefato com
`aapt dump badging` para cobrar quatro coisas que, erradas, só aparecem no aparelho de outra
pessoa: versão e código, a arquitetura pedida, o bundle dentro, e a ausência das permissões
bloqueadas. *E o docblock dessa função prometeu as quatro com três implementadas por vinte
minutos — a doença desta casa, cometida no arquivo escrito para impedir o artefato de mentir.*

## 13 de setembro — o APK de entrega estava assinado com uma chave que o mundo inteiro tem

Medido no artefato com `apksigner verify --print-certs`: `CN=Android Debug, OU=Android,
O=Unknown`, SHA-256 `fac6…3b9c`. É a `debug.keystore` que vem dentro de todo template do React
Native, e o `build.gradle` gerado tem `signingConfig signingConfigs.debug` **dentro do bloco
`release`**, com o aviso do próprio template ao lado — *"Caution! In production, you need to
generate your own keystore file."*

A Play recusar é o menor dos problemas, e é o único que se costuma citar. O que importa aqui é
outro: com o mesmo nome de pacote e a mesma assinatura, **qualquer pessoa constrói um APK que o
Android aceita como ATUALIZAÇÃO deste** — o aparelho troca o aplicativo e o substituto herda o
banco de dados. Num aplicativo cujo trabalho é guardar o livro-razão de uma fábrica, é a única
fundação que vale menos que zero quando quebrada.

**Três decisões de forma, e cada uma vem de um fato deste repositório:**

1. **Plugin, não edição no `build.gradle`.** `android/` é saída do prebuild e está no
   `.gitignore`: editar o arquivo gerado é escrever numa folha que o próximo prebuild joga fora.
2. **O plugin não cria chave nenhuma.** Gerar e guardar a de entrega é ato do dono e é
   irreversível no pior sentido — perdê-la depois de publicar significa nunca mais atualizar o
   aplicativo. Sem as quatro variáveis de ambiente ele devolve o gradle intocado.
3. **A troca é a ÚLTIMA ocorrência.** `signingConfig signingConfigs.debug` aparece duas vezes: no
   bloco `debug`, onde está certo, e no `release`, onde é o defeito. Trocar a primeira inverteria
   as duas — depuração assinada com a chave de entrega e entrega com a de depuração — e a
   compilação sairia zero.

**E a prova foi por EXECUÇÃO, não por leitura do texto.** Rodei o prebuild com as quatro
variáveis e conferi o gradle gerado: `entrega` no `release` (linha 121) e o `debug` intocado
(116). Depois rodei sem elas: zero ocorrências de `entrega`, as duas linhas voltando a `debug`.
Uma guarda que lê o código-fonte do plugin afirma o que ele DIZ; rodá-lo afirma o que ele FAZ, e
para uma transformação de texto que depende de "a última ocorrência" a diferença é tudo.

*E a conferência do assinante AVISA em vez de derrubar, deliberadamente: derrubar impediria o
dono de testar no tablet hoje, e o risco de um APK que só ele instala é menor que o custo de não
ter a leitura dele. No dia da publicação a ausência de chave passa a ser erro, e o docblock diz
qual linha muda.*

## 13 de setembro — o estorno devolvia a quantidade e deixava o erro na média, no servidor

O aparelho já fazia certo desde que este defeito foi consertado lá: `reverseGroup` chama
`recomputeItemCost`, que recompõe a média do razão inteiro ignorando o que tem estorno de pé. O
servidor não tinha nada equivalente. `item_costs` lá tem dois autores — a `0009` na linha de
compra e a `0025` na perna de produção — e nenhum dos dois olha para estorno.

**Os dois números, medidos plantando a ausência do gatilho novo:**

```
aparelho 0,4720   servidor 0,5310
```

`0,4720` é a primeira nota sozinha (R$ 4,72 o quilo). `0,5310` é a mistura das duas, com a nota
estornada ainda dentro. **12,5% de erro no custo unitário, permanente**, embaixo de todo número
de dinheiro que qualquer outro celular lê depois da descida.

E a divergência é pior que o erro sozinho: o aparelho de quem estornou mostra o custo certo, o
servidor guarda o errado, e quem olhar de outro aparelho vê o errado. Duas verdades para a mesma
pergunta.

**O que fez o defeito viver:** a garantia 6 do `db:verify` compara as duas médias — é a única
checagem do projeto que confronta duas implementações independentes da mesma regra — e a sessão
que ela reproduz **nunca atravessava um estorno**. A comparação estava certa e cega, porque o
caminho em que os dois lados mais divergem não estava no cenário.

E a razão de ele não estar era um comentário: a lista de espécies que a sessão precisa exercitar
dizia que *"`sale` e `reversal` não têm escritor ainda"*. Os dois têm — `reverseGroup` e
`recordCount` quando a falta é de produto numa loja (a `0047`). A lista foi derivada do
comentário, o comentário envelheceu, e duas capacidades do servidor ficaram sem uma linha de
prova. **Guarda derivada do que alguém escreveu SOBRE o código não é guarda: é a opinião de
ontem com cara de medida.**

*E uma decisão de forma que valeu a pena escrever: o gatilho é `after insert`, não `before`. A
recomposição LÊ o razão, e a perna de estorno precisa estar lá para o `not exists` ver o que ela
desfez. Num `before` ela ainda não existe, a média sairia idêntica à de antes, e o gatilho
rodaria sem fazer nada — a aparência do conserto sem o conserto, que é o pior resultado
disponível.*

## 13 de setembro — a descida existia, tinha garantia, e não descia uma linha

A rodada 13 pôs a mão de volta no ar: cursor, páginas, ordem de chave estrangeira, escrita
local, garantia 33 no `db:verify`. `typecheck` limpo, 815 testes verdes, a garantia passando.
**E a sincronia de descida devolvia um erro de Postgres antes da primeira linha.**

`src/sync/descida.ts` monta o pedido de TODA tabela como `[...colunasQueSobem(tabela),
'received_at']` e `transporte.ts` ordena por `received_at, id`. O servidor tinha a coluna em
**quatro** das **vinte e três** que descem. A primeira da lista é `carriers`, e `descer()` para
a rodada inteira no primeiro erro — de propósito, para não gravar referência quebrada. Então o
que o dono veria é `column carriers.received_at does not exist`, e nem cadastro, nem razão, nem
disputa de conferência desceria.

**E a fronteira estava DITA, na própria migração que criou a coluna.** A `0061` escreveu de si
mesma: *"só nas três tabelas append-only que descem. Cadastro desce por outro caminho — upsert,
última palavra vence — e para isso `updated_at` já serve."* As duas metades são falsas, e a
segunda é a pior: **`updated_at` não existe em tabela nenhuma deste servidor.** O "outro
caminho" não era um caminho mais fraco — ele não existia. E `pedido()` nunca teve exceção
nenhuma: pede a coluna de todas, inclusive das que a migração declarou fora.

Isto é a regra desta casa contra ela mesma, terceira vez escrita e primeira vez com este
tamanho: **fronteira dita em voz alta continua sendo fronteira.** O que fecha buraco é guarda.

**O que deixou passar tem forma, e é a lição transferível.** A garantia 33 confere que
`movements_visible` EXPÕE as colunas da descida — e ela estava certa. Forma de esquema não é
caminho: nenhuma checagem ANDAVA o pedido. A garantia 36 anda, tabela por tabela, com a lista
de colunas impressa pelo próprio `pedido()` do aparelho — e derrubou o defeito em segundos.

*Quando uma peça nova é um PROTOCOLO entre dois lados, a guarda que serve não pergunta se as
peças existem: ela executa uma volta completa. Conferir a forma dos dois lados é o que a suíte
já faz de graça; o que ela não alcança é a combinação — e é lá que a peça nova mora.*

**E duas coisas piores apareceram ao medir, nenhuma delas "a coluna falta":**

**1. O cursor não se movia na correção.** `default now()` carimba no insert e mais nada.
Cadastro desce por upsert — o item muda de nome — e uma correção que não move `received_at`
fica para sempre ANTES do cursor de quem já desceu. O caso que dói é `check_candidates`:
*"o primeiro que aceitar fica"* (decisão do dono, 11 de setembro) é um `update` da coluna
`resolution` numa linha que o outro celular JÁ desceu. **A decisão nunca chegaria ao outro
aparelho** — a `0063` escreve o estorno no servidor e o celular que perdeu segue com a
conferência de pé no razão dele, para sempre, sem nada reclamar. A rodada 14 inteira dependia
de uma coluna que não se movia.

**2. `purchases.received_at` tinha DOIS significados, e o cursor andava para trás.** Desde a
`0002` ela é *quando a mercadoria chegou* — dado de negócio, escrito pelo aparelho, lado
direito do prazo observado do fornecedor. A descida a usava como cursor. A nota de terça
digitada na quinta nasce com chegada de terça, que já está antes do cursor de quem sincronizou
na quarta: **a nota nunca desce.** E nota sem data de chegada fica de fora para sempre, porque
nulo não é maior que nada.

É a mesma lição que `recorded_by` contra `operator_id` já custou uma rodada aqui — **uma coluna
respondendo duas perguntas é erro, e o sintoma não aparece onde ela é escrita, aparece onde a
outra pergunta é feita.** A de negócio virou `arrived_at` nos dois lados (V37 no aparelho), e
`received_at` passou a ter um significado só — que é justamente o que permite a régua do
`columns.test.ts` dizer a razão dela **uma vez** em vez de vinte e três.

**E o carimbo no INSERT não é redundância com o `default`:** o padrão vale quando o cliente não
manda a coluna, e mandando ele escolhe o valor. Um cliente que enviasse `received_at` de ontem
poria a própria linha atrás do cursor de todos os outros aparelhos — invisível para sempre, sem
erro nenhum. Cursor é fato do servidor, e fato do servidor não se aceita do cliente.

*Cinco plantios, cinco condições: a coluna ausente em `carriers` (`FAIL: a descida de
'carriers' nao anda`), o carimbo ausente em `items` (a correção não move), em
`check_candidates` (a decisão não desce), em `purchases` (a nota atrasada nasce atrás do
cursor) e em `movements` (o cliente escolhe o cursor). Cada um derrubou exatamente a asserção
que o nomeia — e o primeiro plantio, mal feito, derrubou a MIGRAÇÃO em vez da garantia, porque
tirar a coluna e deixar o `comment on column` dela é um defeito que não existe.*

## 13 de setembro — a descida lia pelo portão de leitura, e a média local ia a zero

A rodada 6 do estudo dizia: *"o custo congelado é legível na tabela crua — a view esconde, a
tabela entrega"*. A premissa estava certa e o conserto proposto estava errado, e as duas coisas
só apareceram medindo.

**Primeiro o meu erro de régua, porque ele exagerou o problema em dez.** Perguntei ao Postgres
`has_column_privilege('app_user', tabela, coluna, 'select')` para cada coluna de dinheiro e li o
resultado como resposta: **quinze colunas legíveis por qualquer membro**. Só que a pergunta "quem
sem `view_cost` alcança o custo?" tem duas metades — o **grant** e a **política** —, e eu medi
uma. Dez daquelas quinze estão fechadas por política desde a `0002` e a `0037`: `item_costs`,
`item_cost_history`, `purchases` e `purchase_lines` pedem `view_cost`; `location_prices` e
`sale_price_history` pedem `manage_company`.

**Régua que mede a camada errada exagera — e exagero manda consertar o que já está certo.** Eu
estava a caminho de escrever uma migração de trezentas linhas com seis views novas e seis funções
`security definer` para fechar dez portas que já estavam fechadas. O que restava de verdade eram
**cinco** colunas em três tabelas: as duas de dinheiro do razão, `items.sale_price_rate` e as duas
de embalagem do produto.

**E dessas cinco, quatro NÃO PODEM ser fechadas, porque quem as lê não é uma pessoa — é a
réplica.** O aparelho precisa da taxa verdadeira para escrever o razão, e este projeto já
respondeu isso duas vezes, nas duas direções certas: a `0047` escreveu *"o Conferente congela um
preço que ele não pode ver… com o portão no caminho da escrita, a contagem do operador gravaria
venda sem preço, e a receita do mês sairia menor para quem conta e maior para quem administra"*, e
`listProductsForLedger` diz *"congelar custo e VER custo são perguntas diferentes; só a segunda
tem portão"*.

**E foi aí que o defeito de verdade apareceu, na direção oposta à que eu estava procurando.** A
descida lia o razão por `movements_visible` — a view do portão — e a docblock de `transporte.ts`
chamava isso de acerto: *"um aparelho sem `view_cost` recebe a linha com o custo NULO em vez de
recebê-lo e esconder na tela"*. Soa como a fundação e é o contrário dela: **a descida não é uma
tela, é o caminho de ESCRITA do razão local**, e `descer.ts` chama `recomporCustos` no fim de cada
rodada.

`recomputeItemCost` mistura só linha com taxa não nula — nulo não entra como zero, ele **sai da
conta**. Os dois números, medidos:

```
razão inteiro 0,5310      pelo portão de leitura 0,0000
```

Custo **zero** para todo item que desceu. E toda produção que aquele aparelho registrar depois
congela custo a partir dessa média (`recordProduction` soma `consumedValue` com a embalagem),
num livro que não se corrige — se estorna.

**A tentativa de fechar mesmo assim tem uma medida, e ela fecha o assunto.** Plantei o que a
rodada propunha — `revoke select on movements` mais `grant select` nas outras colunas — e o
`db:verify` reprovou na garantia **4**, com `permission denied for table movements`: uma view
`security_invoker` confere o privilégio de **coluna** de quem a consulta, então fechar a coluna
**fecha a view junto**. O portão de leitura desaparece com o buraco. Sem uma função
`security definer` no meio não existe meio caminho — e com ela a réplica fica sem a taxa.

*A pergunta que fica respondida, e vale para o próximo caso: **gate de servidor não protege um
número que a mesma conta precisa replicar para escrever.** O aparelho e a pessoa são o mesmo
principal, e o número já está no SQLite do celular. O portão útil é o das consultas do aplicativo
— que existe e é onde a fundação o pôs.*

**E um terceiro defeito da descida apareceu ao escrever o primeiro teste dela:** `pedido()` deriva
as colunas de `colunasQueSobem()`, e o `take` do serializador é uma promessa sobre o **servidor**.
`movements.device_id` existe lá desde a `0013` e **não existe no aparelho** — registrado como
fronteira em `PROMETIDA_E_AUSENTE`. Na subida isso é inofensivo (a coluna viaja nula); na descida
o `INSERT` **nomeia** a coluna, e o SQLite responde `table movements has no column named
device_id`. Ou seja: mesmo com o cursor resolvido, a página do razão não entrava.

*Três defeitos, um em cima do outro, na mesma peça, e nenhum deles visível pelo compilador. O que
os revelou não foi releitura: foi escrever o primeiro teste que EXECUTA `descer()` — `descer.ts`,
`gravarPagina`, `proximoCursor` e `pedido` estavam no ar desde 12 de setembro sem um arquivo de
teste que os importasse. Peça nova que é PROTOCOLO entre dois lados não se prova conferindo os
dois lados: prova-se dando uma volta completa.*

## 13 de setembro — o aparelho escrevia com a permissão de ontem, e dez portas não pediam nenhuma

A rodada 7 é sobre uma frase só: **o aparelho recusa o que o servidor recusaria.** O que ela
achou foram três camadas do mesmo defeito, e nenhuma delas é visível pelo compilador.

**1. Dez portas enfileiravam sem pedir capacidade.** `saveItem`, `saveRecipeVersion`,
`saveProduct`, `saveLine`, `saveType`, `saveCategory`, `saveFlavor`, `setItemActive`,
`recordReading`, `openProductionRun`. O servidor recusa cada uma por política, com `42501` — e
`42501` é PASSAGEIRA por decisão escrita (*"consertável do outro lado: um grant amanhã faz a
mesma linha entrar"*), o que é verdade para grant que falta e falso para política que nega.
Sexta aparição da fila travada aqui.

**E as duas SEMENTES de infraestrutura eram o caso escondido, porque elas enfileiram de dentro
de uma LEITURA.** `ensureLocation` cria o lugar da empresa e `ensureProfiles` semeia os sete
modelos; as duas são chamadas por `listPlaces` e `listProfiles`, que são consultas. No celular
de quem só produz, abrir a tela de Lugares punha na fila uma linha que o servidor recusa.
`ensureLocation` passa a enfileirar só quem administra — a linha local continua nascendo, e o id
dela é o da empresa, então a do servidor desce em cima. `ensureProfiles` nem semeia: o id do
perfil é sorteado, e semear sem atravessar deixaria sete perfis desconhecidos e, depois da
descida, **quatorze**.

**A régua mede o CAMINHO, não a função — e duas leituras minhas erraram antes dela, nas duas
direções.** Olhar quem chama `enqueue` diretamente aponta o ajudante interno (`writeItem`) e
perde a porta pública (`saveItem`); exigir o portão NA porta pública acusa `recordTransfer`, que
o tem em `podeGravar` uma camada abaixo. O que vale é *existe portão em todo caminho da porta
até a fila*, e é um ponto-fixo sobre o grafo de chamadas. As duas leituras erradas ficaram
escritas no docblock da guarda.

**2. Cinco CHECKs do servidor viviam só na tela.** `yield_amount > 0`, `loss_fraction < 1`,
`quantity > 0`, `manufactured_needs_recipe`, `shelf_life_days > 0`. Mesmo mecanismo com outro
código: `23514`, também passageiro por decisão medida. E ao medir a CLASSE, o número foi para a
fila do roadmap em vez de virar silêncio: **o servidor tem 43 CHECKs de tabela, o aparelho
carrega 4 no esquema e 8 em código. Sobram 35.**

*E a régua rápida que os cataloga ERRA: pegar o último `create/alter table` antes do `check`
atribuiu `movements: kind <> 'loss'` a `products`. Registrei a ressalva junto do item — régua
imprecisa vira registro de ficção, e registro de ficção é pior que registro nenhum.*

**3. E a raiz: o piso de capacidade era uma SUPOSIÇÃO.** `pisoDoAparelho` devolvia
`capabilitiesFor('owner')` no modo pessoal — as doze —, e a suposição embutida é que a conta que
entrou é a do dono. Verdadeira na fábrica de hoje, falsa no dia em que ele criar uma conta
restrita, que é decisão escrita dele e o caminho normal de quem compra isto para uma equipe.

O defeito tem duas metades e a segunda só existe por causa do item 1: aquele aparelho mostraria
custo e preço a quem o servidor não deixa ver, **e** deixaria nascer a linha que o servidor
recusa — ou seja, o portão novo, com um piso mentiroso, trava a fila em vez de protegê-la. Piso
e portão são a mesma peça vista de dois lados.

Hoje `minhasCapacidades` lê `memberships.capabilities` da própria linha (a política já filtra
por associação ativa) e o piso devolve essa lista. Nulo continua sendo o dono, porque é o estado
de quem nunca falou com servidor nenhum — o piso não inventa restrição para quem não tem com
quem confirmá-la.

**E isso obrigou a ORDEM da rodada automática a mudar, que é o achado mais transferível daqui.**
A configuração da empresa e a lista de capacidades decidem o que o aparelho tem o DIREITO de
escrever, e as duas só desciam quando alguém abria a tela de Conta. Subir a fila antes de
aprender isso é **subir com a permissão de ontem**: o dono rebaixa o aparelho à noite e ele
manda a linha proibida de manhã. `combinado` é a primeira peça de `rodadaAutomatica`, antes de
`subirFila`, e a razão está escrita no teste da ordem — ao lado dos outros três porquês que já
moravam lá.

*A lição de forma: numa rodada automática, a ordem das peças não é estilo — cada inversão custa
uma coisa diferente, e a peça de PERMISSÃO vem antes de toda peça que ESCREVE.*

## 13 de setembro — asserção que só pergunta "foi recusado?" é satisfeita pela recusa ERRADA

A garantia 38 tem quatro condições e eu plantei os quatro defeitos que ela nomeia. Três
morderam. A quarta — *"apagar a versão carimbada é recusado"* — ficou **verde** com o defeito
plantado, e o defeito era trocar `on delete restrict` por `on delete set null`.

A razão é específica e vale para toda chave composta: **num `set null` de chave composta o
Postgres zera TODAS as colunas do par**, `sub_recipe_id` inclusive. E `sub_recipe_id` nulo junto
com `item_id` nulo viola o `one_source` da `0002` (`num_nonnulls(item_id, sub_recipe_id) = 1`).
Então o `delete` era recusado — por outra regra, por outro motivo, e a asserção que só pergunta
*"deu erro?"* aplaudia.

O que isso custaria: com `set null`, o estado que a migração existe para impedir — linha de
sub-receita com carimbo NULO, cujo custo volta a mudar sozinho — seria alcançável apagando uma
versão, e a garantia diria que está tudo bem.

**A regra, então, tem uma terceira metade.** As duas que este arquivo já tinha são *plante o
defeito que a asserção NOMEIA* e *escreva a mensagem que o nomeia*. A que faltava:
**asserção sobre RECUSA nomeia qual recusa** — o nome da restrição, o `SQLSTATE`, a frase. Sem
isso ela mede "o banco disse não", que é uma afirmação sobre o banco e não sobre a regra.

Hoje a garantia lê a mensagem e exige `recipe_lines_sub_version_is_of_sub` nela; com o plantio,
ela reprova dizendo *"foi recusado por outra regra, não pela chave do carimbo"* e imprime o
`one_source` que recusou. A mensagem conta a história inteira para quem só lê o relatório.

*E a irmã disso apareceu no mesmo dia, no primeiro plantio da garantia 36: tirar a coluna do
cursor e deixar o `comment on column` dela derrubou a MIGRAÇÃO em vez da garantia — o defeito
plantado não existia, porque ninguém escreve um comentário para uma coluna que não criou. Plantio
mal feito mede o plantio.*

## 13 de setembro — âncora RELATIVA num teste de migração envelhece no próximo passo

O teste que prova o reparo do nome repetido punha o banco de pé *"no passo anterior ao índice"*
com `migrationSteps.slice(0, migrationSteps.length - 1)`. Isso quer dizer **"tudo menos o
último"**, e o último deixou de ser o índice de nome no primeiro passo acrescentado depois — a
V39, no mesmo dia, uma hora depois.

O efeito é de leitura difícil: o banco subia COM o índice, os três inserts de `Ana` falhavam, e o
teste reprovava **por existir a coisa que ele existe para provar**. Quem lesse a reprovação iria
procurar defeito no índice.

A âncora passou a ser o CONTEÚDO: `findIndex((passo) => passo.includes('people_name_idx'))`, com
uma asserção de que achou. É a mesma família de *"contagem no nome de um passo de CI envelhece"* —
referência relativa é um número disfarçado, e o disfarce é o que faz ninguém notar.

## 13 de setembro — a cascata automática foi RECUSADA, e a medida é o que a recusou

O item 43 previa uma configuração `sub_recipe_change = 'segue' | 'revisa'`, com `'segue'` como
padrão porque ele preserva o comportamento de hoje: ao salvar a calda, o sistema abriria versão
nova de cada ficha-mãe que a compõe, recursivamente para cima, re-carimbando.

Uma revisão adversarial do desenho, feita antes de escrever a cascata, mediu o caminho e ele
termina na fila travada:

1. `saveRecipeVersion` numera por `MAX(version) + 1` lido do **disco local**.
2. O aparelho A edita a base; a cascata cunha `v5` das oito mães. O aparelho B, offline, edita
   **uma mãe qualquer** e numera `v5` também — mesmo `recipe_id`, id diferente.
3. B sobe. O servidor tem `unique (recipe_id, version)`, e a fila sobe por `upsert` com
   `onConflict: 'id'`: conflito de OUTRO índice vira `23505`, que é **permanente** por decisão
   medida. A edição de ficha de B é **descartada**.
4. As `recipe_lines` daquela versão foram enfileiradas depois dela e citam um
   `recipe_version_id` que o servidor não tem → `23503`, que está fora de `PERMANENTES` **de
   propósito**, com a razão escrita: *"ele não acontece — `pendingEntries` manda na ordem de
   escrita"*. Passageira. A fila inteira fica presa atrás delas, para sempre.
5. E a **descida** morre junto: B tem a `v5` dele, a `v5` de A desce, e o
   `UNIQUE (recipe_id, version)` do SQLite recusa. `gravarPagina` levanta, `descer()` não tem
   `try/catch` nessa linha, e a rodada de descida morre para TODAS as tabelas, toda vez.

**O que a cascata muda não é a existência do defeito: é a superfície.** Hoje isso exige duas
pessoas editando **a mesma ficha** offline. Com `'segue'`, uma edição da base **reivindica um
número de versão em nove fichas que ninguém tocou** — de 1 para 9 —, e a segunda pessoa não tem
como saber que está editando algo disputado.

Então a rodada entrega só o `'revisa'`: o carimbo fica, e o editor convida com um toque quando a
sub-receita andou. **E isso deixa de ser configuração**, porque configuração exige dois caminhos
válidos e o outro caminho quebra a sincronia — *"depende vira dado"* vale para preferência de
cliente, não para um desenho que não funciona.

**A metade que a refutação do revisor salvou, e ela reduz o custo da decisão pela metade:** o
docblock de `recipe.ts` promete que *"quando o leite sobe, os oito recalculam"*, e isso **continua
verdade** — preço vem de `itemCosts`, lido fresco em cada chamada, e não passa pela versão. O que
o carimbo congela é *"a base agora leva 2.200 g em vez de 2.000"* — a FÓRMULA. Ainda é dinheiro e
ainda é silencioso em seis telas que não têm marcador, e é metade menor do que parecia.

## 13 de setembro — onde eu DISCORDEI da revisão, e por quê

A revisão recomendou promover `PGRST204` a recusa permanente, com um argumento bom: a migração
`0066` diz que a ordem de implantação *"é evitada por ORDEM e não por código"*, e este arquivo tem
a frase pronta — regra escrita não impede.

**Recusei, e a razão é a assimetria que `recusa.ts` já tem escrita.** `PGRST204` significa
*"coluna que este servidor não conhece"*, e isso é consertável do outro lado: aplicar a migração
faz a mesma linha entrar. É exatamente o caso de `42501` (o grant que falta), que está fora de
`PERMANENTES` de propósito. Promover troca uma falha ALTA e visível (a fila trava, o dono vê) por
uma **perda silenciosa**: a linha sai da frente, o que sai de lado não volta, e a ficha nunca
chega ao servidor — com o carimbo divergindo entre os dois lados para sempre.

A doutrina desta casa escolhe a falha alta, e ela está medida: *classificar permanente como
passageira trava a fila, que é ruim, visível e sem perda; o contrário perde dado em silêncio, que
é o pior resultado que esta fila tem.*

*O que sobra, e é honesto dizer: a exigência de ordem é real e vale para TODA coluna nova de
tabela que atravessa — não é particularidade desta migração. Ela entra na lista do dono como passo
de implantação, e a guarda que existe (`agreement.test.ts`) garante a metade que dá para garantir:
o aparelho não manda coluna que as migrações não têm.*

## 13 de setembro — a guarda de paridade não vê o marcador ERRADO, porque errado nos três é paridade

Doze frases novas desta rodada iam para a tela dizendo, literalmente, `v{version}`. Chave única
em vez de dupla — e **nada** no repositório reprovou: `typecheck` limpo, `lint` limpo, 829 testes
verdes, navegador verde.

A razão é bonita e é do mesmo desenho que protege a tela: `fill` só troca `{{palavra}}`, e o que
ele não conhece **fica intacto de propósito** — há um teste que cobra isso com todas as letras
(*"a hole nobody filled stays visible instead of becoming a blank"*), porque marcador visível é
melhor que um branco onde devia estar um número. Então `{version}` não é erro para ninguém: é
texto.

**E a guarda que existia era a que mais parecia ir pegar.** `a translation keeps every hole the
original has` compara os buracos de cada frase entre os três idiomas — e as três estavam erradas
pela mesma mão, no mesmo minuto: zero buracos em português, zero em inglês, zero em espanhol,
paridade perfeita. É a armadilha que este `CLAUDE.md` já tem escrita — *"uma guarda que compara
duas coisas escritas pela mesma mão não guarda nada"* — e ela estava numa guarda de i18n, que é
justamente onde a régua de paridade parecia bastar.

A guarda nova não procura a chave única: **tira todo `{{palavra}}` bem-formado e vê se sobrou
chave.** Assim ela pega também `{{version}` sem o par, `{{ version }}` com espaço e `{{}}` vazio —
todas invisíveis para a paridade, porque nenhuma delas é um buraco. Medida antes de entrar contra
o dicionário de verdade: acusou as **doze** e nenhuma das outras **3.577** das 3.589 frases dos
três idiomas. O caso falso é o corpo inteiro, e não um exemplo que eu escrevi.

*E a forma como isto apareceu vale mais que a guarda: não foi teste nem revisão — foi **ler o
próprio diff antes de commitar**, e desconfiar de uma chave que não parecia com as vizinhas. Duas
linhas acima, no mesmo arquivo, `fromSheet` usava `{{recipe}}`.*

## 13 de setembro — o filtro que comparava id de VERSÃO com um mapa de RECEITA

`loadRecipeGraph` carrega as versões carimbadas pelas linhas e diz, em comentário, que traz *"só
as alcançáveis, nunca a tabela inteira"*. O filtro era `!(id in atual)` — e `atual` é chaveado por
id de **receita**, enquanto `id` é id de **versão**. Nunca casa. O filtro não excluía nada.

**A resposta continuava certa** — `subDaLinha` resolve o carimbo da versão corrente para a mesma
versão que a `atual` já tinha —, então nenhum número mudou. O que estava errado era a medida, e
o custo é real na fábrica normal: a que nunca reeditou uma calda paga uma segunda consulta que
devolve exatamente as linhas que a primeira já trouxe, em seis telas e no assistente. Com o
filtro certo (um `Set` dos ids de versão já lidos) essa fábrica faz **zero** consultas a mais.

É a régua que mede a camada errada outra vez, e com a mesma assinatura do caso do
`has_column_privilege` desta semana: o predicado compila, roda, devolve booleano, e responde uma
pergunta que ninguém fez. A asserção que o nomeia é `Object.keys(grafo.versoes)` vazio quando o
carimbo aponta para a versão corrente — antes ela vinha com uma entrada, e a entrada era cópia.

## 13 de setembro — o portão tem uma guarda contra erro de código de saída, e dois erros de código de saída dentro

Duas das oito advertências do `.proofgate/verify.sh` desta entrega eram **falsas, pela mesma
causa**, e a causa é literalmente a regra que uma das guardas do próprio portão existe para
cobrar (`48-pipeline-exit-code`: *"exit codes are read from the command that produced them"*).

O mecanismo, medido:

```bash
set -uo pipefail
git diff BASE..HEAD | grep -E '^\+' | grep -Eqi "alter table|migrat"   # → 141
git diff BASE..HEAD | grep -E '^\+' | grep -Ei  "alter table" >/dev/null # → 0
```

`grep -q` **sai no primeiro casamento**. O produtor a montante — um `git diff` de 195 mil
linhas — continua escrevendo num cano que não tem mais leitor, recebe SIGPIPE e morre com
141. Com `pipefail`, o status do CANO é 141, e o `if` lê isso como "não casou". Quanto mais
cedo o casamento acontece, mais garantido é o erro: **a guarda falha exatamente nos casos em
que a evidência é abundante.**

O efeito nas duas:

| guarda | o que ela dizia | a verdade medida |
|---|---|---|
| `schema-constraint-no-migration` | *"16 restrições sem NENHUMA migração neste diff"* | **1.243** linhas de evidência de migração — o ramo positivo era inalcançável |
| `version-bump-no-release` | *"versão subiu, nenhum release à vista"* | **7** linhas de `gh release create/upload/edit` no workflow que publica o APK |

E a assimetria importa. No mesmo arquivo, o mesmo `grep -q` com `|| continue` produz o
**oposto**: um arquivo que deveria ser conferido é pulado em silêncio — falso negativo, que é
o pior lado para uma guarda. Os dois estão consertados, e os dois sentidos foram provados:
com a evidência presente sai ✅; com o padrão trocado por uma palavra que não existe no diff,
sai ⚠️ e código 2. Uma guarda que passou a não poder avisar seria pior que o aviso falso.

**A varredura, porque conserto de guarda não termina no arquivo que o mostrou:** vinte e cinco
guardas usam `pipefail` e onze têm `grep -q` num cano. Nove são inofensivas por medida, não por
sorte — o produtor é `printf '%s' "$content"` de UMA linha ou um `echo` da lista de arquivos,
muito abaixo dos 64 KiB do cano, então a escrita termina antes de o `grep` sair. **O perigo é
`git diff` como produtor**, e depois destes consertos não sobra nenhum: `grep -n "git diff" |
grep "grep -q"` devolve zero.

*A lição que transfere: quando uma advertência de ferramenta contradiz o que o diff obviamente
contém, meça a FERRAMENTA antes de justificar a advertência.* Eu ia escrever uma justificativa
para cada uma — a justificativa seria bem escrita, e as duas seriam mentira.

## 13 de setembro — a oficina só achou o buraco porque a ÂNCORA foi arrumada

O `mutate` desta rodada deu **1 sobrevivente** e **1 não medida**, e as duas apontam para o
mesmo mecanismo: *mutação que não pousa não mede nada, e ninguém sente falta dela.*

**O sobrevivente era um buraco de dinheiro que existia há tempo.** `costRecipe` com a ficha da
RAIZ ausente devia levantar; trocado o `throw` por um custo zero, **a suíte inteira ficou
verde**. O que isso deixa acontecer: um semi-acabado apagado faz todo sabor que o compõe ficar
**mais barato**, calado — e esse número é o denominador de toda margem. Devolver zero é pior que
quebrar, porque zero parece resposta.

E havia um teste que parecia cobrir isso: *"a sub-recipe that is not there stops the costing"*.
Ele prova a **sub**-receita ausente, que é a linha 239. A raiz é a linha 190, outra linha, outro
`if`. **Duas linhas com o mesmo `if (!recipe) throw` não são uma regra com guarda: são duas
regras, e só uma tinha.** O mesmo vale para `explodeRequirements`, que tem a terceira cópia — e
lá o defeito lê pior ainda, porque lista de insumos vazia significa *"não precisa de nada"* e
libera a produção.

**Por que só apareceu agora:** esta âncora estava velha. A rodada do carimbo re-chaveou o grafo,
`costRecipe` virou casca de `custoDaVersao`, e o `from` da mutação passou a citar um trecho que
não existia mais — ela saía **não medida**, e "não medida" é uma linha discreta num relatório de
154. Arrumada a âncora, a mutação pousou e o buraco apareceu na primeira execução.

**A outra não medida era a gêmea disso, na fila:** a âncora citava
`classeDaRecusa(recusada.codigo) !== 'permanente'` e a linha virou `!ehDefinitiva(recusada)` na
rodada da fila — porque a falha LOCAL não tem código do Postgres. Re-ancorada, ela derruba
**quatro** testes. Ou seja: aquela regra estava bem guardada e a oficina não sabia.

**A regra que sai daqui, e ela é de operação:** *"não medida" merece o mesmo tratamento que
"sobrevivente"*. As duas dizem que a regra está sem guarda; a diferença é que o sobrevivente
acusa a SUÍTE e a não medida acusa o ARQUIVO DE MUTAÇÕES. Quem lê o relatório procurando
vermelho passa batido pela segunda — e foi assim que um buraco de dinheiro ficou escondido atrás
de uma âncora velha, num repositório que roda a oficina toda rodada.

*E a assimetria de custo vale a pena escrever: refatorar move âncora, e mover âncora desliga
guarda em SILÊNCIO. O refator aparece no diff; a guarda desligada não aparece em lugar nenhum
até alguém ler a última linha do relatório da oficina.*

## 13 de setembro — "é tela empilhada" não era regra: era racionalização

Duas telas deste aplicativo tratavam o MESMO vazio de formas opostas, e as duas tinham a razão
escrita ao lado:

- `app/production/new.tsx` e `app/products/new.tsx`: *"a ficha se cadastra noutra tela e **não se
  navega daqui**: esta é uma tela empilhada, e o caminho de volta é o de sempre"* — e o vazio era
  uma frase cinza, sem saída.
- `app/picking.tsx`: *"Erro que IMPEDE diz para onde ir. Sem esta porta a pessoa fica sabendo que
  falta algo e não sabendo o quê fazer"* — e ela faz `router.push('/places')`.

**`app/picking.tsx` também é empilhada.** Então a razão dada não distinguia os casos: ela
descrevia uma propriedade que as duas compartilham, e a conclusão só valia num lado. É o formato
mais convincente de argumento errado — verdadeiro sobre o sujeito, irrelevante para o predicado —
e ele sobreviveu porque cada comentário foi lido sozinho, na tela dele.

**A regra que de fato separa os dois é o que há para PERDER.** No vazio não há nada digitado
(não há nem produto para escolher): sair não custa formulário nenhum, e FICAR custa a rodada de
quem não sabe o que fazer. Num formulário meio preenchido a resposta se inverte, e aí "não
navegar daqui" é a regra certa — com o sujeito certo. As duas telas passaram a oferecer a porta,
e os dois comentários passaram a dizer isso.

**E o documento também dizia a versão velha**: o item 7 do `docs/roadmap.md` citava a razão
derrubada como fechamento de um item. Corrigido lá, porque decisão registrada envelhece — e essa
é lida em toda sessão.

*A regra de leitura que sai daqui: quando dois lugares tratam o mesmo caso de formas opostas,
teste a razão de cada um contra o OUTRO caso. Se ela vale para os dois e conclui coisas
diferentes, ela não é a razão — é a justificativa que alguém escreveu depois de decidir.*

## 13 de setembro — dois toques transformavam o picolé em insumo, e o caminho passava por três arquivos

A cadeia, cada elo defensável sozinho:

1. `app/inputs/[id].tsx` oferecia *"Corrigir o cadastro"* → `/inputs/new?id=` **para qualquer
   espécie**. Razoável: é a mesma tela que cadastra e corrige, e isso está escrito no docblock
   dela (*"um formulário com id é coisa muito menor de manter que dois que divergem"*).
2. `app/inputs/new.tsx` montava o rascunho com
   `kind === 'input' || … ? existing.kind : 'input'`. Razoável: o formulário oferece três
   espécies, e um valor fora delas precisava de um padrão.
3. `saveItem` grava `kind = excluded.kind` no `ON CONFLICT`. Razoável: quem digitou "Palito"
   como insumo e queria embalagem conserta num toque.

**Juntos, os três apagam um produto.** Salvar aquela tela com o id de um picolé muda a espécie
da linha: o produto sai da lista, `products.item_id` continua apontando para ela, e a
classificação do razão passa a discordar do cadastro — em silêncio, e **sem estorno possível,
porque cadastro não é movimento**. Nenhum dos três elos é errado no arquivo dele; o defeito só
existe no caminho, e o caminho não tem dono.

**Onde a recusa foi posta, e por quê.** Não na tela: tela é onde o defeito aparece, não onde se
impede. `saveItem` passou a recusar a troca que **cruza a linha** entre o que se vende
(`product`, `resale`) e o que se compra ou consome (`input`, `packaging`, `store_supply`) —
então qualquer chamador futuro encontra a mesma parede. E a trava não é grossa de propósito:
entre as três espécies que a fábrica de fato confunde ao cadastrar, a troca continua livre, e há
asserção cobrando isso — uma trava que recusasse tudo seria o conserto que tira o caso de uso.

**A régua da própria casa cobrou duas coisas que eu não tinha visto**, e vale registrar as duas:

- O cartão de recusa que eu escrevi nasce em `color.warning`, e `src/theme/assinatura.test.ts`
  exige o marcador `{/* sinal */}` para cartão que nasce em cor de alerta e não volta. Ela está
  certa: o cartão **é** o impedimento, e a cor está dizendo "isto está acontecendo agora".
- E fechar o buraco deixou uma falta à vista: **não existe editor de produto**
  (`app/products/new.tsx` não lê `useLocalSearchParams`). O botão foi escondido para `product`
  porque não havia para onde ele ir que não corrompesse a linha — e o que ele escondia é que
  corrigir o nome de um picolé, o rendimento por unidade ou a embalagem por unidade não tem
  caminho nenhum hoje. Entrou como item 45 do `docs/roadmap.md`, com medida.

*A regra de método: quando três elos razoáveis produzem um defeito, o conserto vai no elo que
todos atravessam — e o teste também. Consertar a tela deixa a próxima tela reabri-lo.*

## 13 de setembro — cumpri a Lei 2 com um chute, e o chute virou taxa congelada

O cadastro de produto nascia com `perUnit = '75'` e `packagingCost = '0,05'` cravados. A Lei 2
diz que nenhum campo nasce vazio, e ela estava cumprida — com um número inventado, que é **pior
que vazio**: campo vazio manda a pessoa pensar, campo com número plausível é assinado sem ser
lido. E o segundo entra em `unitPackagingRate`, que é a **taxa congelada** de toda corrida
daquele produto: cinco centavos que ninguém releu ficam no razão para sempre, e taxa congelada
não se corrige — se estorna.

O palpite certo estava a uma linha: o **irmão** — outro produto da mesma linha, da mesma
categoria e com a mesma unidade de rendimento — já tem os dois números respondidos por quem
conhece a fábrica. `listProducts` traz `lineId`, `categoryId`, `yieldPerUnit` e
`unitPackagingRate` desde sempre; nenhuma tela os lia para isso.

**Três coisas que a implementação ensinou, e as três são de desenho:**

1. **A unidade entra na regra do irmão por MEDIDA, não por cuidado.** `yieldPerUnit` é "quanto
   do tacho vai em cada unidade": um pote cujo tacho rende em ml não diz nada sobre um picolé
   cujo tacho rende em g. Sem essa condição o palpite erraria por um fator de mil — plausível e
   errado, que é a pior forma de errar num campo que vira dinheiro.
2. **O portão da consulta tem de sobreviver ao palpite.** `unitPackagingRate` chega **nulo**
   para quem não tem `view_cost` — é a permissão funcionando, não dado faltando. Sugerir o
   número do irmão sem olhar isso seria vazar custo por uma porta lateral, então quem não pode
   ver custo cai no padrão, como quem não tem irmão.
3. **E o defeito que eu mesmo escrevi no caminho, que é o mais instrutivo.** A primeira versão
   exibia `perUnit || sugestao` e o `onSave` gravava `num(perUnit)`: a tela mostrava 75 ml e o
   produto nascia com rendimento **zero**. `typecheck`, `lint` e 835 testes passaram, e o
   navegador também passaria — o `CLAUDE.md` já diz que campo controlado cujo valor derivado não
   muda é um dos casos que ele estruturalmente não vê.

   O conserto não foi consertar as duas linhas: foi **uma resposta só**, `campoComSugestao`, que
   já existia como módulo puro com teste de Node justamente para isto. Mais uma da família *"a
   peça certa já estava no repositório"*.

**E a guarda nova achou um quarto defeito em mim.** A régua de fonte — onde a tela usa o molde,
o estado cru aparece só no `useState` e no `onChangeText` — acusou quatro linhas, e a quarta era
o **array de dependências do `useMemo`** lendo `perUnit`: com o irmão mudando (outra categoria
escolhida), a prévia do custo não recalculava. A tela mostrando um rendimento e a conta usando
outro, de novo, por outra porta.

*As outras três eram a própria régua: chave de objeto (`perUnit: …`) e caminho de dicionário
(`t.app.productForm.perUnit`). Neste projeto campo, chave e estado se chamam igual **de
propósito** — é a mesma coisa dita em três lugares —, então a régua precisou olhar a POSIÇÃO:
precedido de ponto é acesso a propriedade; seguido de dois-pontos é chave sendo escrita. Régua
que acusa três falsos e um verdadeiro seria "consertada" apagando o verdadeiro.*

## 13 de setembro — alarguei a régua para tirar um falso positivo e comprei um falso NEGATIVO

A guarda de fonte da rodada — *onde a tela usa `campoComSugestao`, o estado cru aparece só no
`useState` e no `onChangeText`* — acusou a chamada quebrada em três linhas: com
`campoComSugestao(` numa linha e o argumento `quantity,` na seguinte, a dispensa (que olhava a
linha) não alcançava o argumento.

O conserto óbvio foi olhar a linha e as duas de cima. Ele **desligou a guarda**: dois plantios
depois, `const units = parseTyped(quantity)` **duas linhas abaixo** da chamada passou a ser
absolvido — e é exatamente esse defeito que a régua existe para pegar, o mesmo que nesta rodada
fez a tela mostrar 75 ml e o produto nascer com rendimento zero.

**Só descobri porque re-provei o plantio depois de mexer na régua.** A regra desta casa manda
provar detector novo nos dois sentidos; o que faltava escrito é que **mexer numa régua que já
passou é régua nova** — e a tentação é a pior possível, porque a mudança foi feita para atender
um falso positivo, ou seja, com a sensação de estar melhorando a medida.

A saída não foi uma régua mais esperta: contar parênteses em JSX é a armadilha que este
repositório já pagou (`[^)]*` parando no `()` da arrow function). Foi **estreitar a dispensa de
volta e mudar a escrita**: a chamada fica numa linha só. Se ela não couber, o nome está longo
demais, e a régua acusando é o aviso — não o defeito.

*A assimetria que decide, e ela já estava escrita para testes: falso positivo custa uma leitura;
falso negativo é uma promessa falsa, e alguém vai confiar nela. Quando as duas saídas custam,
escolha a que erra para o lado de acusar.*

## 13 de setembro — a fábrica que só revende não se DEDUZ, e a lista de `grant` do provador é um espelho feito à mão

A escada do briefing cobra receita, ficha e produção de quem ainda não fez nada — e para quem
**só revende** ela nunca vai fechar: não há receita para cadastrar, e o degrau fica de pé para
sempre dizendo que falta o que não existe. É o alerta inventado com outro rosto, e o pior tipo,
porque ele nunca sai da tela.

A tentação era deduzir: empresa sem receita e com item de revenda é distribuidora. **E a dedução
não separa o distribuidor da fábrica de primeiro dia** — as duas têm zero receita e zero
produção, e o que as separa não está no razão: é INTENÇÃO. Fundação desta casa, aplicada ao pé
da letra: *"depende de quem usa"* vira configuração, não adivinhação. Então entra um interruptor
(`0067`, `companies.only_resells`), nasce **FABRICA** porque é o caso de quem o app foi escrever,
e `degrausQueFaltam` devolve `[]` quando ele está ligado.

*A borda, escrita porque ela é o motivo de o padrão ser esse: quem só revende paga um toque nos
Ajustes para a escada calar. Quem fabrica não paga nada. O inverso — nascer ligado — poria a
fábrica a descobrir por que o app não a ensina a produzir.*

**E o conserto do dia veio de uma garantia que acusou o servidor errado.** A garantia 39 falhou
com `permission denied for table companies` ao provar que a conta consegue virar o próprio
interruptor, e eu fui ler a política. Ela existe desde a `0001` (`companies_write`) e está certa:
**quem não tinha o `grant update` era o PROVADOR**. A lista de `grant` do `verify-migrations.sh`
é um espelho, mantido à mão, do que o servidor concede — e um espelho com um buraco diz *"o
servidor recusa"* sobre um servidor que aceita.

Isso é a irmã da regra já escrita (*a garantia se escreve na forma com que o APARELHO manda*):
ela também se escreve com as **permissões** que o aparelho tem. Uma garantia de RLS que falha por
`grant` ausente reprova pelo motivo errado, e a leitura natural — "o servidor está trancado, ótimo"
— é a pior possível, porque ela transforma um buraco do provador em prova de segurança.

## 13 de setembro — quatro peças certas, nenhuma ligada: a notificação que nunca chegou

A rodada dos avisos achou cinco defeitos entre o razão e o bolso, e **quatro têm a mesma
forma**: a peça existe, está correta, e ninguém a chama. O canal do Android era citado no
gatilho desde o primeiro dia e nunca criado (e o sistema descarta a notificação sem erro). O
`{kind, subjectId}` era gravado em cada aviso e lido por ninguém. O comportamento em primeiro
plano nunca foi declarado, então a biblioteca descartava o aviso com o aplicativo aberto. O
motivo de não ter agendado era devolvido e morria num `.then` de corpo vazio.

Nenhum é alcançável por `typecheck`, `lint` ou teste de função — as funções estavam certas. É
o P1 na metade difícil (*quem EXERCITA isto?*), e aqui não há navegador nem celular que
responda: notificação não se lê num teste de navegador.

**E o plano dava o assunto como FEITO, com a prova exata que esta casa desconfia.** A tabela
dizia *"o tipo existe e o agendador está montado na raiz"* — as duas coisas verdadeiras, e
nenhuma delas sobre o aviso chegar. O que faltava era tudo o que fica entre elas.

**Pior: dois itens FECHADOS consertaram a volta de uma porta que não existia.** Os itens 6 e
33 chamam o aviso de validade de *"uma das duas portas que o produto promete"* e resolveram a
pilha vazia de quem entra por ligação profunda. O conserto valia para o QR do engradado; a
metade da notificação não tinha chamador — tocar no aviso abria a capa. Então a régua "meça a
afirmação do item antes de construir" tem uma gêmea: **meça também o que o item fechado
afirma sobre o MUNDO, não só sobre o código.** Dois itens verdes cobrindo uma porta fechada.

**A armadilha da escolha discreta, e ela está na documentação da própria biblioteca.** O
comportamento em primeiro plano parecia pedir `shouldPlaySound: false` — aviso sem som é aviso
educado. O tipo da `expo-notifications` diz, na linha de cima: *"On Android, setting
`shouldPlaySound: false` will result in the drop-down notification alert **not** showing, no
matter what the priority is."* Desligar o som desliga o balão junto, e o defeito voltaria por
outro caminho com a linha parecendo correta. **A régua que sai daqui: quando a opção é do
sistema operacional, leia a DECLARAÇÃO dela antes de escolher o valor plausível** — foi assim
que o `type` do gatilho apareceu, e é a terceira vez neste módulo.

## 13 de setembro — a mesma decisão escrita em quatro lugares, e o quarto era uma COR

O dia de comprar (cobertura ≤ prazo do fornecedor + folga) foi unificado em 6 de setembro
depois de o aplicativo discordar de si mesmo. Hoje, indo ligar a capa à régua, achei que ela
estava escrita em **quatro** lugares e só dois usavam a boa:

| onde | régua |
|---|---|
| o aviso | `prazo + folga` |
| a ficha do insumo | a mesma álgebra, em unidades (`reorderPoint`) |
| o cartão "Insumo acabando" | **sete dias cravados** na consulta |
| a barra da cobertura | **um quinto de trinta dias** — ou seja, seis |

Com fornecedor de seis dias, a notificação dizia *"compre"* a oito dias de cobertura e a capa
ficava calada por dois. O achado que se leva é o quarto: **uma régua pode estar escondida numa
COR.** `Drain` pintava de alerta abaixo de 20% do horizonte — decisão de desenho, defensável
como desenho, e lida como decisão pela legenda que diz *"a cor conta o que o número já
disse"*. Quem procura réguas duplicadas procura `if`, número e nome de função; ninguém procura
`color.warning`.

*E o conserto não foi copiar a fórmula para a capa: foi a régua virar função e a cor RECEBER a
resposta de quem decide. Quatro cópias de uma fórmula são quatro chances de divergir; uma
função com quatro chamadores é uma.*

## 13 de setembro — a régua que casava só com a PROSA, e o plantio que injetou um `import`

Duas medidas erradas minhas na mesma rodada, e as duas foram pegas pela mesma família de
guarda-costas:

1. A régua nova (*a capa não recria o horizonte de compra*) usava `[^)]*` para chegar ao quinto
   argumento, e `[^)]` **não atravessa o `)` de `empresaDaqui()`** — então ela nunca casou com
   as chamadas. Ela acusou o comentário que conta a história do defeito, em português, e eu
   quase "consertei" o código por causa disso. Quem salvou foi a asserção de vivacidade
   (*"a capa deixou de perguntar o que está acabando"*): sem ela a guarda passaria para sempre
   sem ler nada.
2. Para provar a régua do tato no sentido falso, injetei `tatoDeSucesso` num cadastro — **só o
   `import`**. A guarda passou, com razão: import não é chamada. Eu quase escrevi que a régua
   era fraca; o defeito que a asserção nomeia é a CHAMADA, e com ela a reprovação veio na hora.

As duas são a mesma lição por dois lados: **toda guarda precisa de uma asserção que falhe
quando ela não lê nada**, e **todo plantio precisa ser conferido no disco pelo que a asserção
nomeia** — não pelo que eu quis dizer.

## 13 de setembro — o esquema de hoje é a SOMA das migrações, e eu conclui de uma duas vezes

Indo dar escritor à matrícula de aparelho, apontei dois defeitos no servidor. Os dois eram
leitura errada minha, e as duas leituras erraram da mesma forma:

1. **`devices.responsible_id` aponta para CONTA.** A `0013` declara exatamente isso
   (`references memberships(id)`), e `memberships.user_id` é `not null references auth.users`
   — ou seja, só quem tem conta poderia responder por um aparelho, o que contradiz a decisão
   do dono de que quem entra por PIN não tem conta. Eu já ia escrever a migração que reponta.
   **A `0035` repontou em 7 de setembro**, três linhas depois de fazer o mesmo com
   `operator_id`.
2. **`product_categories` sobrevive ao Reset `all`.** A função que apaga não nomeia a tabela,
   e ela nasceu depois da função. **Mas `line_id` referencia `product_lines` com
   `on delete cascade`**, e o `all` apaga `product_lines`: ela cai junto desde sempre.

Num conjunto append-only, **a forma atual de uma coluna é a ÚLTIMA frase sobre ela, nunca a
primeira** — e a forma atual de uma tabela inclui as AÇÕES das chaves que apontam para ela. As
duas checagens concretas que faltavam, e que custam segundos:

- coluna que parece errada → `grep` pelo nome dela em TODAS as migrações, não a leitura da que
  a criou;
- tabela ausente de uma lista de `delete` → olhe `on delete` das chaves dela antes de chamar
  de buraco.

*Custo real: zero, porque as duas checagens vieram antes de escrever a migração. Se a ordem
tivesse sido a inversa seria um `alter table` inútil aplicado no banco do dono — e migração
não se desfaz.*

## 13 de setembro — acrescentar UMA tabela ao aparelho tem nove obrigações, e nenhuma está numa lista

`devices` entrou no esquema do celular e a suíte reprovou **nove** guardas de uma vez. Nenhuma
delas é sobre a tabela: todas são sobre o que uma tabela nova OBRIGA, e cada uma nasceu de um
defeito que já aconteceu:

| a guarda | o que ela cobra | o defeito que a pariu |
|---|---|---|
| adoção | a tabela é recarimbada ao trocar de empresa | linha com carimbo velho, invisível |
| apagar tudo | a tabela entra na ordem certa | RESTRICT levantando chave e "apagar tudo" não apagando nada |
| contagem do Reset | a confirmação conta o que destrói | três vezes a tela contou menos do que destruiu |
| varredura de órfãs | a entrada da fila sem linha é esquecida | fila travada no primeiro buraco, para sempre |
| colunas que viajam | o que o serializador promete existe | `device_id` viajando nulo por um ano |
| grants | a conta do app tem INSERT e UPDATE | `permission denied` parando a fila INTEIRA |
| sessão do aparelho | a travessia é exercitada de verdade | a garantia 6 cobrindo nove tabelas de dez |
| assinatura de cor | o glifo toma o tom do assunto | o mesmo assunto em duas cores em duas telas |
| contagem do plano | o documento diz o número que o sistema tem | plano que envelhece em silêncio |

**O valor não é a lista: é ela ser DERIVADA.** Nenhuma dessas guardas conhece `devices`; todas
perguntam ao `sqlite_master`, ao serializador ou ao próprio arquivo. Uma lista escrita à mão
teria aprovado as nove — e eu teria descoberto cada uma pelo sintoma, meses depois, com a fila
de alguém parada.

*E a décima obrigação não tinha guarda: a ORDEM do Reset no SERVIDOR. `devices.location_id` é
RESTRICT lá, e o `all` apaga `locations` — latente enquanto a tabela estava vazia, real no
instante em que a matrícula ganhou escritor. Entrou na `0068` com a garantia 40 medindo os dois
mundos, e a categoria da lição é nova: **defeito latente até haver escritor** é defeito que
nenhuma suíte pega, porque o caminho não existe ainda.*

## 13 de setembro — a prosa que explica a guarda dispara a guarda, quatro vezes num dia

Quatro vezes hoje uma frase minha, escrita para EXPLICAR um defeito, foi lida como o defeito:

- o docblock do relógio citando `new Date().toISOString()`;
- o comentário da capa citando a consulta com horizonte cravado;
- o docblock do repositório citando o comando de inserção do razão — duas vezes, uma para a
  guarda do operador e outra para a do aparelho.

A saída é sempre a mesma e vale escrever de uma vez: **reescreva a prosa, nunca marque exceção
nela.** Marcador em comentário ensina a espalhar marcador, e a próxima pessoa que quiser
explicar um defeito vai preferir não explicar.

*A exceção que eu abri, e por que: numa das quatro a régua era NOVA e ainda não tinha passado —
ali eu a fiz ler só o código, sem os comentários, e re-provei os dois sentidos. Régua que já
passou não se mexe; régua que está nascendo se acerta.*

## 13 de setembro — a sétima crase, e o perigo era o SUCESSO sujo

`verify-migrations.sh` imprimia `line 551: 0062: command not found` no meio de uma execução
que termina em `OK - all forty guarantees hold`. Duas mensagens dessas viviam ali desde que a
garantia 34 foi escrita: crase dentro de uma string de shell é substituição de comando, e num
heredoc não citado o shell expande o conteúdo inteiro.

**O que torna esta cicatriz a mais teimosa do projeto — sétima ocorrência — é que ela não
falha.** Ninguém lê uma linha de ruído dentro de um relatório verde. Então ela não vai embora
com atenção, e a resposta foi a que este arquivo já prescreve para tudo que repete: uma guarda
(`src/prova-sql.test.ts`) que só olha as regiões onde o shell de fato lê — heredoc sem aspas no
delimitador e `-c "…"` multilinha —, provada contra o caso verdadeiro e contra o heredoc citado,
que é o falso.

## 13 de setembro — a checagem reprovou pelo RELÓGIO, e a causa era o cartão que eu acrescentei

A rodada da matrícula do aparelho fechou 59 de 60 no navegador. A que caiu foi *"a escolha da
identidade está nos ajustes"* — e o `CLAUDE.md` já registra essa mesma checagem como a que
*"tem cara de defeito de verdade"* e passa sozinha. Passou sozinha de novo.

**Mas "era disputa" é meia resposta, e a outra metade é minha.** A checagem espera
`waitForTimeout(2500)` e depois LÊ a tela. A rodada acrescentou aos Ajustes um cartão que faz
duas consultas novas — então a tela passou a montar mais devagar, e uma espera fixa transforma
"mais lento" em "não existe". A irmã dela já tinha sido consertada com `assentar` (esperar o
texto parar de crescer) e a razão está escrita lá; esta ficou para trás e cobrou na primeira
tela que engordou.

A regra que sai: **quando uma checagem de navegador cai depois de uma mudança que engorda a
tela, a pergunta não é "é flake?" — é "ela espera relógio ou condição?"**. Se for relógio, a
causa é a mudança E a espera, e consertar a espera é o que impede a próxima.

*E o tamanho da dívida está medido: sobraram **191** `waitForTimeout(2500)` na suíte. Não dá
para trocar todas de uma vez — algumas esperam uma escrita terminar, e "o texto parou de
crescer" passaria cedo demais —, então a conversão é caso a caso, na checagem que cair. O
número fica escrito para a próxima sessão não descobrir isso de novo pelo sintoma.*
