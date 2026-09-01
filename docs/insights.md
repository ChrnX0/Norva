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

## Em aberto

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
- **O aparelho ainda não tem consumo nem perda.** A contagem faz o saldo descer,
  mas a perda com motivo obrigatório continua sem existir, e sem ela toda
  diferença legítima vira "inexplicada".
