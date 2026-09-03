# NORVA — como se trabalha aqui

Sistema de gestão para quem **fabrica e distribui**. Nasce numa fábrica de
picolés, mas será publicado nas lojas: **nada de regra chumbada de sorvete, nada
de nome de empresa**.

O usuário final é o dono da fábrica, de baixa habilidade técnica. Quando
simplicidade e sofisticação brigarem, **simplicidade ganha**.

---

## Fundações que não se quebram

Estas não são preferências. Cada uma existe porque a alternativa corrompe um
número que alguém vai usar para decidir onde colocar dinheiro.

**Livro-razão append-only.** Não existe coluna `estoque_atual`. Saldo é a soma
dos movimentos, e a imutabilidade é imposta por *trigger no banco*, não por
convenção. Corrige-se por estorno, nunca por exclusão.

**`Cents` é inteiro, `Rate` é fracionário.** Valor que alguém paga e preço por
unidade não são o mesmo tipo de número. Polpa a R$ 12,40/kg é 1,24 centavo por
grama; arredondar isso para inteiro perde um quinto antes da primeira
multiplicação — foi um bug real. Só o valor final arredonda, uma vez. Dinheiro
nunca é float, em lugar nenhum.

**Permissão mora na consulta, nunca numa instrução.** Quem não pode ver custo
não recebe o número: a checagem roda *antes* da consulta, então não existe
número para vazar. Esconder botão é decoração.

**i18n desde o primeiro texto.** Nenhuma tela guarda uma palavra. Tudo vem de
`src/i18n/locales/`, nos três idiomas. `Widen<T>` faz chave nova em português
quebrar a compilação das outras duas até serem escritas.

**A camada de dados devolve fato, não frase.** Quem escreve português é a tela.
Um módulo que sabe o que depende do quê não deve saber falar.

**Multi-empresa desde a primeira linha.** `company_id` em toda tabela, RLS no
servidor.

**"Depende" vira dado, nunca código — e nunca uma pergunta.** Cada fábrica é um
caso: uma usa celular compartilhado na câmara fria, outra dá um aparelho por
pessoa; uma quer aprovação de pedido, outra não. Quando a resposta certa é
"depende de quem usa", **não se escolhe um dos lados e não se pergunta qual** —
constrói-se a escolha como configuração da empresa, e os dois caminhos existem.

Isto vale inclusive para as perguntas feitas ao dono: pedir que ele escolha
entre A e B quando A e B são preferências de cliente é empurrar para ele uma
decisão que o produto deveria absorver. A pergunta certa nesse caso é qual é o
**padrão** — não qual é o único.

**E quando não há escolha, não há pergunta.** Se a coisa tem que ser feita,
faça — pedir permissão para o óbvio ("achei o bug; quer que eu conserte?") não
é cautela, é devolver trabalho embrulhado como consulta. Perguntar custa uma
rodada dele e não compra informação nenhuma.

A borda, para a regra não virar desculpa. Pergunta-se em três casos, e só:

1. **A resposta muda o que é construído** — e não é preferência de cliente, que
   vira configuração em vez de pergunta.
2. **É irreversível** — destruir dado, publicar para fora, gastar dinheiro dele.
3. **É decisão de dono** — faseamento, preço, marca, o que entra em produção.

Fora desses três: decida, faça, e **diga o que foi feito e por quê**. Assumir e
avisar é melhor que perguntar e esperar; assumir e calar é pior que as duas.

---

## A Lei da Inteligência

Toda tela responde três coisas: **o que é normal ali, o que está diferente
agora, e qual é a próxima ação provável.** Tela que não responde as três não
está pronta.

1. Nunca peça o que o sistema pode deduzir.
2. Nenhum campo nasce vazio.
3. Nenhum número aparece sozinho — sempre com a comparação.
4. Avise na **data da decisão**, não na data do problema.
5. Erro se **impede**, não se reclama.
6. Toda conclusão abre a conta (`[por quê?]`).
7. "Está tudo bem" é estado válido e bonito. Alerta inventado ensina a ignorar
   alerta.

O sistema **sugere, nunca decide calado**. E a inteligência é matemática
determinística sobre o livro-razão — por isso funciona offline, e por isso o
`[por quê?]` é possível.

---

## Tom de voz

Frase curta, verbo na frente, segunda pessoa. **Orienta, não fiscaliza**
("Produza até segunda", não "Estoque insuficiente"). **Nunca culpa pessoa**
("Faltaram 3 caixas na conferência", não "a loja errou"). Zero jargão: a
confirmação diz o que vai acontecer, com os números por extenso.

Sistema que acusa vira inimigo da equipe, e equipe que vê o app como inimigo
sabota o dado.

---

## A barra de verificação

Antes de dizer que algo está pronto, **rode**. Não é opcional e não é por
amostragem:

```bash
npm run typecheck
npm run lint
npm test
npm run mutate       # quebra o código de propósito: a suíte morde mesmo?
npm run e2e:fast     # o app dirigido num navegador de verdade, em quatro fatias
npm run db:verify    # Postgres descartável, oito garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

**A espera era o gargalo, e virou medida — 3 de setembro.** A barra inteira levava
perto de meia hora por commit, e quase tudo era partida de processo: `mutate` abria
64 vezes a suíte em série, o `e2e` rodava 30 checagens uma atrás da outra, e cada
guard da proofgate abria **um `grep` por linha adicionada** (com 31 mil linhas no
diff, mais de um milhão de processos por execução).

| | antes | depois |
|---|---|---|
| portão da proofgate | ~8 min | **22 s** |
| `mutate` (64 mutações) | 12 min | 6 min |
| `e2e` (30 checagens) | 7 min | 2 min 40 |

Duas coisas que seguem disso, para não se perder:

- **`e2e:fast` exporta uma vez e fatia as checagens.** O `npm run e2e` continua
  existindo e serve para uma checagem só (`--only`), que é o laço de trabalho.
  Reusar `dist` **porque ele existia** já fez a suíte passar verde para uma tela que
  não tinha a mudança — no `e2e:fast` o pacote é sempre o da execução.
- **O `mutate` nunca mais toca a árvore de trabalho.** Ele copia o código para
  `.mutate/` e muta a cópia. As três redes que existiam contra "deixar uma mutação
  no disco" — `finally`, ganchos de sinal, e a checagem de árvore suja que abortava
  a execução seguinte — eram três redes para um abismo que não precisava existir.

O `mutate` existe porque suíte verde não quer dizer regra protegida: quer dizer
que os exemplos escolhidos não a exercitam. Na primeira execução ele trocou o
`Math.round` do `amountOf` por `Math.floor` — *o* ponto de arredondamento do
sistema — e **noventa e dois testes continuaram verdes**. A regra da capa deste
projeto estava sustentada por coincidência aritmética.

O `e2e` existe porque três bugs passaram por toda a bateria unitária e só
apareceram quando o app foi aberto: uma confirmação que não existe na web,
rotas que abriam num banco vazio, e uma tela falando dois idiomas. **Nada disso
é visível de dentro de um módulo.**

Duas regras de operação, ambas cicatriz:

- **Nunca mate processo por padrão.** Um `pkill` largo nesta sessão matou a
  verificação que tinha acabado de ser disparada — inclusive a nova, junto com a
  velha. Se precisar parar algo, pare pelo PID que você mesmo anotou.
- **A proofgate lê `base..HEAD`, não a árvore de trabalho.** Marcador de
  justificativa em arquivo sem commit não existe para ela. Commit primeiro,
  depois confira.

**E o portão passou a valer sozinho.** Duas vezes num dia eu empurrei antes de
ler a saída da barra — uma com o shellcheck vermelho, outra com uma mutação
sobrevivente que o CI pegou logo depois. Isso não se conserta com atenção. O
`push-guard` da proofgate roda antes de qualquer `git push` e recusa enquanto não
houver veredito fresco e passante para o HEAD atual; ele também bloqueia
`--no-verify`, porque o adversário nesse caso sou eu. Desliga em
`proofgate.json` (`pushGuard: false`) ou com `PROOFGATE_HOOK_OFF=1`.

O `proofgate` é o portão de entrega. **Qualquer ❌ significa que não está
pronto**, e todo ⚠️ pede justificativa escrita — nunca dispensa em silêncio.
Depois dele vem o portão de julgamento: diga em que nível a afirmação central
se sustenta (E0 acreditado → E3 exercitado de verdade → E4 visto em produção),
com o comando que provou. "Compilou" não é "funciona".

---

## `/insights`

O comando `/insights` gera um relatório sobre as sessões deste projeto. **Ele é
reservado ao usuário** — está marcado como `disable-model-invocation`, então
Claude não consegue rodá-lo nem deve reproduzir o que ele faz por outro caminho.

A diretriz, então, é de mão dupla e vale para os dois lados:

- **O usuário roda `/insights` com frequência** — é a única leitura de fora
  sobre como o trabalho está indo: onde o tempo foi, o que se repetiu, o que
  deu errado mais de uma vez.
- **Claude age sobre o que ele mostra.** Achado de `/insights` não é conversa:
  vira mudança no código, no `CLAUDE.md` ou na barra de verificação, do mesmo
  jeito que um ⚠️ da proofgate exige justificativa escrita. Padrão que aparece
  duas vezes num relatório é dívida, não coincidência.
- **E o resultado é dito na tela, na mensagem seguinte.** O comando obriga uma
  resposta de texto fixo no turno em que roda — não dá para comentar ali. Então
  a mensagem logo depois traz, sempre: o que virou mudança e onde, o que foi
  recusado e por quê, e **o que o relatório errou**. Relatório é leitura de
  fora, não autoridade: já aconteceu de ele dizer que um PR fechou sem os checks
  verdes quando tinha fechado cinco de cinco.
- **Antes de tudo: confira se ele viu alguma coisa.** Em 2 de setembro o
  relatório veio com "0 messages across 0 sessions (1 total)" e todas as seções
  vazias — enquanto o `session-meta` da mesma sessão registrava 68 minutos, 275
  mensagens e 2 commits. O trabalho aqui acontece numa sessão só, longa e
  retomada, e o relatório pula a sessão que já analisou. **Zerado não é "está
  tudo bem": é instrumento cego**, e a resposta certa é dizer isso em vez de
  fingir leitura. Para ter relatório de verdade, rode o comando a partir de uma
  sessão nova. E note que a contagem de código (`+0/-0 Lines, 0 Files`) está
  zerada em todos os relatórios, inclusive nos que têm dado.
- **E o relatório vem junto, em texto, não como link.** O comando devolve um
  `file:///root/...` que só abre na máquina onde a sessão roda — o dono lê no
  celular, e lá o link não abre nada. Então a mensagem seguinte **transcreve o
  que o relatório disse**: os números do topo, o que ele viu como objetivo, o
  atrito que contou e o que ele achou de errado. Link sozinho é relatório não
  entregue.

---

## Ultracode é regra do projeto, não modo da sessão

O ultracode cai sozinho: é estado de sessão, e sessão acaba. **Aqui ele vale
sempre, esteja o botão ligado ou não** — decisão do dono, 1 de setembro.

Na prática, sem esperar o botão: tarefa substantiva se orquestra com workflow ou
subagentes em vez de se resolver sozinho; todo achado passa por verificação
adversarial antes de virar afirmação; custo de token não é restrição. Fora
disso ficam só conversa e edição mecânica trivial.

Se uma sessão indicar ultracode desligado, **esta regra continua valendo** — ela
é do projeto, não da sessão. E o inverso também: nada aqui autoriza gastar
rodada com workflow para trocar uma vírgula.

*Nota honesta, para não parecer resolvido: um gancho de início de sessão que
injetasse esta regra sozinho foi tentado e recusado pelo classificador de
permissão — escrever instrução para as próprias sessões futuras é coisa que ele
guarda, com razão. Então o mecanismo é este arquivo, que é lido em toda sessão.*

---

## Nunca ocioso — regra imutável

**Enquanto houver serviço a ser realizado, não se fica parado.** Decisão do dono,
2 de setembro, e ela não é conselho de produtividade: é o que separa uma sessão
que trabalha de uma que fica olhando o próprio painel.

Ficar ocioso aqui tem uma forma específica e ela engana, porque parece
diligência: o PR está verde, então re-checo o PR; nada mudou, então re-agendo o
check-in; e a rodada inteira passa confirmando que nada mudou. Vigiar o que já
está pronto **não é serviço** — é o intervalo entre serviços, e o intervalo se
preenche com a próxima coisa que precisa existir.

Então, quando um trabalho fecha, a pergunta não é *"tem mais alguma coisa?"* —
é **qual é a próxima**, e ela está escrita em **`docs/roadmap.md`**. Esse arquivo
existe porque a lista já esteve espalhada entre as fases deste arquivo, as dívidas
do `docs/insights.md` e a cabeça de quem trabalhava — e no dia em que o escopo
fechou, a sessão ficou sem lista tendo trabalho de sobra. Item fechado sai do
roadmap no mesmo commit que o fecha; item novo entra com `arquivo:linha`. Se nada
lá está de pé, o que sobra ainda é serviço: procurar o insight que a diretriz de
baixo exige.

Três coisas que **não** contam como ficar ocupado, para a regra não virar
desculpa para barulho:

- **Esperar não é trabalho, e trabalhar não é interromper.** Enquanto a barra
  roda ou o dono não respondeu, o certo é tocar o que não depende daquilo — não
  ficar consultando o estado do que está rodando.
- **Inventar tarefa é pior que parar.** Vale a mesma regra do alerta inventado: a
  próxima coisa vem da lista escrita, não de um item criado para parecer
  ocupado.
- **E o dono continua sabendo o que está acontecendo.** Não ficar ocioso não
  autoriza sumir por uma hora: o que foi feito e por quê se diz, curto, ao fim
  de cada rodada.

O único parar legítimo é o que já está escrito na borda das perguntas: decisão
irreversível, decisão de dono, ou resposta que muda o que é construído. Fora
disso: pega a próxima e faz.

---

## Insight constante — diretriz obrigatória

**Toda rodada de trabalho termina com uma pergunta: o que apareceu aqui que
ninguém tinha visto?** Não é enfeite de conversa e não é opinião — insight neste
projeto é achado que muda alguma coisa, e a prova de que mudou é o arquivo que
foi editado por causa dele.

Três regras, para não virar decoração:

1. **Todo insight vira uma linha em `docs/insights.md`**, com o que se viu, por
   que importa e o que mudou por causa disso. Achado sem consequência não entra
   — se não mudou nada, ou não era achado, ou o trabalho não acabou.
2. **Insight se procura, não se espera.** Antes de escrever código novo, a
   pergunta é o que o código existente está contradizendo: uma fundação que só
   vale no papel, uma função construída e nunca chamada, um número que só sobe,
   um teste que passa pelo motivo errado. Foi assim que se descobriu que o
   aplicativo tinha o livro-razão no domínio e um `estoque_atual` no banco.
3. **"Não achei nada" é resposta válida e precisa ser dita.** Inventar um achado
   para parecer diligente é o mesmo defeito do alerta inventado: treina a
   ignorar. Vale a mesma regra do briefing — está tudo bem é um estado.

Onde procurar, quando não houver pista óbvia: o que a fundação promete contra o
que o esquema faz · o que o domínio exporta contra o que as telas chamam · o que
o aparelho grava contra o que o servidor aceitaria · o que um teste afirma
contra o que ele exercita de verdade · o que a Lei da Inteligência exige de cada
tela contra o que ela responde hoje.

---

## Decisões do dono, já tomadas

Registradas aqui porque decisão esquecida vira pergunta repetida.

- **Entrada no chão de fábrica: configuração da empresa, não escolha nossa.**
  Compartilhado usa PIN numa grade de nomes — dois segundos, de luva, offline.
  Pessoal entra uma vez e fica. Os dois existem; a empresa escolhe.
- **Quem cria a empresa é o dono**, cadastrando-se sozinho. A partir daí ele
  cadastra as outras pessoas diretamente **ou** aprova quem pediu associação por
  um código da empresa. Os dois caminhos.

- **O relatório fala de onde, não de quem — e o aparelho tem responsável.** O
  livro-razão sempre grava quem (`recorded_by` é obrigatório desde a primeira
  migração); o que a tela conta é outra coisa, e o padrão é não nomear. A
  responsabilidade vem do aparelho ser cadastrado com um responsável: o
  movimento aponta para o aparelho, o aparelho aponta para uma pessoa. Quem
  quiser nomear a cada caixa liga `names_who_recorded`.
- **O login autentica o sistema, não a pessoa.** A conta é da empresa. Ela
  distribui acesso criando outros e-mails ou mandando código de convite por
  perfil — não é o e-mail pessoal do operador que entra no app. **Quem estava
  operando é anotação do registro**, escolhida na hora, não identidade da sessão.
  São duas perguntas (`recorded_by` = qual conta escreveu, imposto pelo servidor
  e incedível; `operator_id` = quem estava com o aparelho), e uma coluna só
  respondendo as duas é erro — já custou uma rodada inteira.

- **Aparelho emprestado entra como produção e nada mais.** Celular da empresa
  passa de mão; quem está com ele usa o papel `operator` — sem custo, sem preço,
  sem dinheiro. O aparelho continua respondendo.

- **O operador confere a prateleira.** Numa fábrica de seis pessoas quem anda
  até a prateleira é quem trabalha lá, não o dono. Negar a permissão não deixa o
  número mais seguro — deixa a contagem sem acontecer, e saldo que ninguém
  conferiu há meses é pior que saldo corrigido hoje de manhã. O que protege é o
  piso, não a permissão: contagem é perguntada toda vez, e é gravada como
  diferença que o livro-razão guarda, nunca como valor que sobrescreve.

---

**Antes de chamar algo de defeito, procure a decisão.** Três vezes numa sessão eu
apontei "violação de fundação" no que era fronteira registrada: o `UnitStepper`
sem uso (é componente da Fase 2), o `[por quê?]` ausente na home (a conta abre
num toque, na receita), e o assistente monolíngue — que tem o raciocínio inteiro
escrito no topo do `src/assistant/index.ts`, inclusive quando deixa de valer.

O custo não é o tempo perdido, é pior: eu quase "consertei" uma decisão que
alguém tomou por um motivo que eu não tinha lido. Então a busca vem antes da
acusação — `grep` no docblock do arquivo, no `docs/insights.md` e nas decisões
deste arquivo. Se houver decisão escrita, o achado não é defeito: ou é pedido de
mudança para o dono, ou não é nada.

**Contradição achada é suspeita de leitura errada, até virar prova.** Quando o
esquema parece contrariar uma fundação, a primeira hipótese é que eu li errado —
não que a fundação esteja furada. Antes de construir qualquer coisa em cima
disso: conferir a lista de decisões acima, e **rodar a contradição contra o
sistema** até ela falhar ou passar de verdade. Construir sobre uma premissa
inventada custa a rodada inteira, e o pior é que o código fica bonito: testes
verdes protegendo uma regra que ninguém pediu.

**A proofgate cresce com o uso — é diretriz, não cortesia.** Toda vez que um erro
aqui vira um padrão que um script pegaria, ele vira guard no repositório dela
(`ChrnX0/proofgate`), com teste positivo e negativo, e sobe por PR. Conselho eu
esqueço na próxima sessão; guard roda sozinho. Vale para o que a ferramenta erra
sobre si mesma: o `dead-allow` nasceu de um marcador dela que não suprimia nada.

## Faseamento

**Fase 1 dada como feita — decisão do dono, 1 de setembro.** A Fase 2 está
destravada: produção, lote, QR e câmara fria podem começar. Não se reabre.

A auditoria mediu 6 prontos, 9 parciais e 1 ausente na Fase 1, e o dono decidiu
com esse número na mão. Os parciais são "funciona para o exemplo semeado" e
"existe o cálculo, falta a escrita" — o tipo de coisa que uso real corrige melhor
que auditoria. O único ausente era a produção gravar a versão de receita usada,
que é trabalho da Fase 2 de qualquer jeito.

**Alvo: um mês, e o corte que o torna verdade — decisão do dono, 1 de setembro.**
O plano inteiro dava 4 a 8 meses, e o que dominava esse número não era código: o
Espelho da Loja precisa de meses de movimento real, e o fiscal é um microserviço
.NET com certificado A1 e homologação na SEFAZ. Trabalhar mais rápido não encurta
nenhum dos dois.

O que cabe em um mês é **F2 + F3**: produção com lote e validade, etiqueta e QR,
câmara fria com saldo, lojas e clientes com ficha de acordo, pedido com reserva,
separação, os quatro postos de controle, app do entregador, devolução. No fim
disso a fábrica para de usar papel para romaneio, conferência e etiqueta.

Fica fora, e cada corte tem razão escrita: **o relatório** do Espelho (a captura
entra — contagem cega e perdas com motivo; o relatório mente com duas semanas de
dado), **o fiscal** (projeto à parte, e o plano já diz que nada depende dele),
**as compras inteligentes** (precisam do prazo observado, que só existe depois) e
**os trunfos** (PAC/POD, clima, roteirização — diferencial de mercado, não a dor
de hoje).

O risco nomeado: a F3 tem ergonomia que não se verifica sem aparelho — tela
capacitiva a -18°C, luva, QR a um braço de distância. Isso pede rodadas depois de
alguém usar, e elas cabem no mês só se o teste acontecer junto, não no fim.

**O portão que sobrou é por item, não por fase.** Três perguntas, nesta ordem, e
a primeira que reprovar decide:

**P1 — Quem chama isto no mesmo commit?** Sem chamador, não entra. Fim. É a
doença provada deste repositório: `assistant_phrase` com índice dedicado e
nenhuma escrita, `Draft.kind` sem leitor, `balanceAt` e `daysOfCover` chamados só
por teste, quatro seções de dicionário nos três idiomas sem uma tela. O número da
fase não pegou nenhuma delas.

**P2 — Complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item
depende de observar alguém. **Mas antes de travar, cheque a F7:** se o que muda
com a observação é *preferência de quem usa*, não é pergunta nem espera — é
configuração, e os dois caminhos existem. Só trava o que nenhuma configuração
resolve.

**P3 — Entrando errado, conserta com um commit ou com migração e estorno?** Se
toca `supabase/migrations/`, o caminho de escrita de `movements`, ou a semântica
de `movement_kind`/`location_kind`, é caro e permanente. Forma de esquema se
adivinha de graça enquanto há zero linhas; conteúdo de livro-razão não se
corrige, se estorna.

**A primeira coisa que a F7 já resolveu.** Perguntavam se a câmara fria é saldo
separado ou o mesmo saldo noutra sala. Depende da fábrica — então vira dado: o
saldo passa a filtrar por local, e quem tem um lugar só tem um local só. Hoje
`ensureLocation` cria uma `location` única cujo id é o `company_id`, e as três
consultas de saldo somam `WHERE company_id = ? AND item_id = ?`, sem
`location_id` — correto para um lugar, e é essa generalização que a Fase 2 pede
primeiro.

---

## Git

Desenvolvimento na branch designada da sessão; `main` só por merge de PR, que é
ato do dono. Migração é append-only: `supabase/migrations/` e o `MIGRATIONS` de
`src/data/db.ts` só crescem — **editar um passo que já rodou faz o banco e o
arquivo divergirem em silêncio**.

Commit explica *por que*, não *o que* — o diff já diz o quê.
