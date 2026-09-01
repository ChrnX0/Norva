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
npm run e2e          # o app dirigido num navegador de verdade
npm run db:verify    # Postgres descartável, seis garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

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

A regra antiga dizia "nenhuma fase começa antes da anterior estar em uso real",
e ela travava demais e de menos ao mesmo tempo. Travava a 0016 do fiscal, cujo
layout quem decide é a SEFAZ e nenhuma observação da fábrica corrigiria. E não
travava o defeito que este projeto de fato tem — coisa construída sem chamador,
que já apareceu quatro vezes: `assistant_phrase` com índice dedicado e nenhuma
escrita, `Draft.kind` sem leitor, `balanceAt` e `daysOfCover` chamados só por
teste, e as seções `production`, `loss`, `posts` e `scan` do dicionário, nos
três idiomas, sem uma tela. **O número da fase não pegou nenhum dos quatro.**

O portão agora é por item, não por fase. Três perguntas, nesta ordem, respondidas
em menos de um minuto. **A primeira que reprovar decide.**

**P1 — Quem chama isto no mesmo commit?** Sem chamador, não entra. Fim. Esta é a
doença provada do repositório, e nenhuma justificativa a dispensa: código sem
chamador fica verde para sempre porque nada depende dele.

**P2 — Complete a frase: "eu mudaria isto se eu visse ___".** Se a frase sai, o
item depende de observar alguém e está travado até haver quem observar. Se não
sai, não é observação-dependente, e **o número da fase não tem autoridade sobre
ele**.

**P3 — Entrando errado, conserta com um commit ou com migração e estorno?** Se
toca `supabase/migrations/`, o caminho de escrita de `movements`, ou a semântica
de `movement_kind`/`location_kind`, é caro e permanente: exige a observação
**mesmo que a P2 não tenha saído**. Forma de esquema se adivinha de graça
enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna.

**E o portão nomeia o que o bloqueia, com data.** "Está em uso real" não tem
condição de término: dá para passar seis meses respeitando o faseamento sem
nunca produzir a evidência que ele exige, e aí ele deixa de ser disciplina e
vira álibi. Então o que bloqueia se escreve por extenso — hoje é *mesclar o PR,
publicar o APK e alguém registrar uma compra na fábrica* — e se a data passa sem
o ato acontecer, o que se revisa é o ato, não o portão.

**O que continua travado, e por quê.** A câmara fria é o segundo lugar que este
sistema vai ter, e hoje o saldo não filtra por local nenhum: `ensureLocation`
cria uma única `location` cujo id **é** o `company_id`, e as três consultas de
saldo somam `WHERE company_id = ? AND item_id = ?`, sem `location_id`. Isso está
certo enquanto existe um lugar só. A pergunta que a Fase 2 obriga — a câmara é
saldo separado ou o mesmo saldo noutra sala? — **não tem resposta no código, tem
resposta na fábrica**, e uma semana vendo onde o açúcar é guardado responde de
graça. Escolher agora propaga o chute para toda consulta de saldo, para a média
móvel, para a contagem e para a etiqueta. Mesma coisa para o Espelho da Loja, que
precisa de meses de movimento: rodá-lo com duas semanas de dado dá número errado
e decisão errada em cima.

---

## Git

Desenvolvimento na branch designada da sessão; `main` só por merge de PR, que é
ato do dono. Migração é append-only: `supabase/migrations/` e o `MIGRATIONS` de
`src/data/db.ts` só crescem — **editar um passo que já rodou faz o banco e o
arquivo divergirem em silêncio**.

Commit explica *por que*, não *o que* — o diff já diz o quê.
