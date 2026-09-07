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

## A barra de verificação — proporcional, não obrigatória

**Decisão do dono, 5 de setembro: a bateria inteira estava atrapalhando mais que
ajudando.** Ela existia por um motivo certo e virou atrito — `mutate` são seis
minutos, o `e2e` mais três, e o portão reclama de coisa que não tem relação com o
que mudou. Rodadas inteiras foram gastas servindo a barra em vez de servir o app.

Nada foi apagado. O que mudou é **quando** cada coisa roda:

| O que mudou | O que roda antes de dizer que está pronto |
|---|---|
| Ambiente, script, documentação, design | **nada** — o que prova é a coisa funcionar |
| Tela ou componente | compila + **a foto no emulador** |
| Domínio, dados, migração — onde mora dinheiro e saldo | `typecheck` + `npm test` |
| Fechar uma etapa, abrir PR para `main` | a barra inteira, uma vez |

A barra inteira, quando for a vez dela:

```bash
npm run typecheck
npm run lint
npm test
npm run mutate       # quebra o código de propósito: a suíte morde mesmo?
npm run e2e:fast     # o app dirigido num navegador de verdade, em quatro fatias
npm run db:verify    # Postgres descartável, dezenove garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

### O layout se adapta — não existe "o aparelho"

**Decisão do dono, 5 de setembro.** Fixar uma resolução e ajustar o layout até ficar
bonito nela é o mesmo erro que gerou o retrabalho, noutra dimensão. A resolução do
emulador é microscópio, não especificação.

O que o layout enxerga não é pixel: é **dp** — pixels divididos por (densidade/160).
O mesmo "1080 de largura" é 393 dp num telefone de 440 dpi e 720 dp num tablet de
240 dpi. **Do telefone ao tablet a largura dobra**, e uma coluna que serve a 393 dp
vira tira esticada a 800 dp: lá o certo é refluir em colunas, não escalar.

Daí três regras de construção:

1. **Nenhuma medida de tela em pixel fixo.** Largura vem de `flex`, porcentagem ou
   `useWindowDimensions()`. Número mágico de largura é defeito.
2. **A quebra é por dp, não por aparelho.** Os pontos que importam: 360 (piso do
   Android), ~400 (telefone comum), 600 (tablet pequeno), 840 (tablet).
3. **A prova é a comparação, não a foto.** `node scripts/aparelho.mjs fotos <rota>`
   tira a mesma tela em cinco larguras — telefone pequeno, telefone, telefone grande,
   tablet e tablet deitado — trocando `wm size`/`wm density` sem reiniciar. Uma foto
   isolada não responde "adapta?"; cinco lado a lado respondem.

4. **A ferramenta que troca a largura DEIXA a largura trocada.** `wm density` é
   persistente: em 7 de setembro o emulador estava preso em 240 dpi de um teste
   antigo, e eu passei a sessão inteira lendo **720 dp — tablets** — como se fossem
   telefones, medindo margens e julgando composição na largura errada. A foto não
   avisa: ela sai 1080 px de qualquer jeito, e 1080 px é 393 dp ou 720 dp conforme
   uma variável que ninguém vê no retrato. **Antes de olhar qualquer foto, `adb
   shell wm density` e a conta** — e `wm density reset` ao terminar de comparar
   larguras, sempre, porque quem esquecer envenena a próxima sessão inteira.

**E a regra que vale mais que todas elas juntas: verde não prova tela.** O tema
claro ilegível que chegou ao dono passou por 338 testes verdes e 36 checagens de
navegador. O que prova tela é a **foto do emulador**, olhada. Isso agora existe:
`bash scripts/ambiente.sh` prepara a máquina e `node scripts/aparelho.mjs` sobe,
instala e fotografa.

A CI segue a mesma divisão: rápido (tipos, lint, teste, pacote) em todo push;
pesado (mutação, navegador, banco, portão) só indo para `main` ou pelo botão.

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

- **E nunca ESPERE por padrão, pelo mesmo motivo.** `until ! pgrep -f "mutate.mjs"`
  parece o contrário do `pkill` largo, e é o mesmo defeito virado do avesso: o
  laço que procura o padrão **casa consigo mesmo**, porque a linha de comando
  dele contém o padrão. Duas esperas assim ficaram vivas por horas depois de o
  trabalho ter acabado, e apareceram no painel do dono como "3 tarefas em
  execução" enquanto nada executava. Espere pelo PID que você anotou, ou pelo
  arquivo de saída ficar pronto.

- **Nunca mate processo por padrão.** Um `pkill` largo nesta sessão matou a
  verificação que tinha acabado de ser disparada — inclusive a nova, junto com a
  velha. Se precisar parar algo, pare pelo PID que você mesmo anotou.
- **Não se escreve laço de espera. Nenhum.** `until ! pgrep -f "e2e/flow.mjs"; do
  sleep 10; done` casa com o **próprio shell**, cuja linha de comando contém esse
  texto — então ele espera a si mesmo, para sempre. Isso já aconteceu duas vezes, e
  a segunda foi depois de a primeira estar escrita aqui: em 5 de setembro o dono
  mandou uma foto de uma tarefa parada há **1h03** e era exatamente esse laço, de
  novo. Regra escrita não impediu; o que impede é não haver laço.
  **O jeito certo já existe e é mais curto:** dispare com `run_in_background` e
  siga trabalhando — a notificação de término chega sozinha. Se precisar mesmo
  esperar uma condição, ela nunca pode ser um `pgrep` cujo padrão está na linha de
  comando que o executa.
- **Servidor de desenvolvimento é processo, e processo esquecido cobra.** Um
  `expo start` ficou **6h38** no ar sem ninguém usar, com o Metro observando o
  disco numa máquina de quatro núcleos, roubando CPU de toda exportação e de toda
  fatia do navegador — que foi o que produziu a "disputa" que eu diagnostiquei
  duas vezes. Antes de culpar a máquina de lenta, olhe `ps -eo etime,args
  --sort=-etime` e veja o que está lá desde a manhã.
- **`import()` não é checagem de sintaxe: ele RODA o arquivo.** Usei
  `node -e "import('./scripts/mutate.mjs')"` duas vezes para ver se a edição tinha
  quebrado a sintaxe, e as duas vezes o script inteiro começou a rodar. Com `&` no
  fim do comando, ele ainda ficou **órfão** (`ppid 1`), fora de qualquer árvore que
  eu fosse olhar depois. Um deles rodou a suíte de mutação por **oito horas** numa
  máquina de quatro núcleos, roubando CPU da auditoria e produzindo fatias vermelhas
  no `e2e` que eu diagnostiquei como disputa — o que era verdade, e não era a causa.
  Sintaxe se confere com `node --check arquivo.mjs`, que valida e não executa.
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

- **Supabase: nada no ar antes de a sincronia existir.** Não há cliente Supabase no
  projeto — nem em `package.json`, nem em `node_modules`; toda menção ao nome é
  comentário ou leitura da pasta de migrações. As 32 migrações são arquivos
  versionados, e quem as prova é o `npm run db:verify`, que sobe um Postgres
  descartável e não depende de nuvem nenhuma. Provisionar (e pagar) projeto antes de
  existir o caminho de escrita é gastar por nada.

- **Aparelho emprestado entra como produção e nada mais.** Celular da empresa
  passa de mão; quem está com ele usa o papel `operator` — sem custo, sem preço,
  sem dinheiro. O aparelho continua respondendo.

- **O layout vem antes do login — e nada fica pela metade.** *"Como vc já começou
  a trabalhar no layout então termina. Nada de deixar etapas inacabadas. Isso mais
  atrapalha do que tudo."* Decisão do dono, 5 de setembro. Depois do layout, o
  login/conta é o próximo, e ele pede estudo antes de código: é a base de perfil,
  pedido de loja e notificação.

- **O servidor sobe o mais tarde possível.** A conta do Supabase é paga e tem
  folga, e mesmo assim: *"usar com sabedoria"*. Enquanto o caminho de escrita não
  existir de verdade, o app continua inteiro no aparelho — as 32 migrações são
  arquivos, e quem as prova é o `db:verify` local.

- **Sem dados fiscais no começo.** CPF e CNPJ ficam para depois: pedi-los puxaria
  o cadastro fiscal de graça, mas prende o produto ao Brasil, e o app vai para as
  duas lojas. Fica a pergunta em aberto, para estudo: como se faz o equivalente
  disso noutros países.

- **Crédito de serviço é último recurso, não conveniência — decisão do dono, 6 de
  setembro.** *"Coloca como regra usar os créditos e limites dos serviços APENAS se de
  fato vc mesmo nao puder fazer o serviço."* Vale para minuto de GitHub Actions, build
  da Expo/EAS, deploy da Vercel, e qualquer coisa que consuma cota de uma conta dele.

  A pergunta, antes de disparar qualquer botão: **este container consegue fazer isto?**
  Se consegue, faz aqui. O runner só entra no que a máquina daqui não alcança.

  O que motivou: em 6 de setembro eu disparei o `build-apk.yml` para compilar o APK, e
  este container compila o mesmo APK em **5 minutos** — SDK, JDK 21 e a pasta `android/`
  estão aqui. Foram minutos de runner gastos por eu não ter perguntado se eu mesmo podia.

  A borda, para a regra não virar teimosia: o que a máquina daqui NÃO faz é o que
  precisa de outro mundo — um Postgres de verdade da conta dele, um runner limpo para
  provar que a barra não depende do meu disco sujo, ou uma assinatura/loja. Nesses
  casos usa-se, e diz-se por quê.

- **O `EXPO_TOKEN` vazado fica como está, por ora.** Decisão do dono, 6 de setembro:
  *"por enquanto eu nao vou trocar o token do expo"*. Está registrado para não virar
  lembrete repetido — o risco continua o mesmo e a decisão de quando trocar é dele.

- **O dono tem tablet, e vai testar o APK nele.** Decisão de 6 de setembro, e ela
  destrava o que eu tinha travado no portão P2: *"eu tenho um tablet, depois a gente
  compila o apk e eu testo"*. Vale a lição junto — **P2 não é uma afirmação sobre o
  mundo, é uma pergunta**, e eu a respondi sozinho ("ninguém usa tablet") em vez de
  fazê-la. Antes de travar um item por observação, cheque se quem observa está do
  outro lado da conversa.

- **Foto do cadastro mora no celular.** *"Começa simples, pelo celular. Mais para
  frente quando o app estiver gerando receita a gente faz um upgrade nisso."*
  Nuvem custa todo mês e não paga nada até o produto pagar.

- **Mais peles virão, e o tema é ponto de extensão.** Decisão do dono, 6 de setembro:
  *"qq tema futuro ou o q vc chama de skin tem q poder ser aplicado sem problemas… vc
  notou q futuramente a gente vai criar mais skins? pq essa é a ideia."* Então uma pele
  nova escreve **duas coisas** e ganha o resto: os **traços** (`Tracos` em
  `src/theme/tokens.ts` — `genero`, `tintaCheia`, `marcaVemDoTom`, `titulo`,
  `radius.controle`), que é o que os componentes compartilhados perguntam a ela; e a
  **roupa da capa** (`src/home/capas/` — casco de página, casco de peça, e as peças que
  ela desenha à sua maneira). O nome de cada traço diz o que ele **decide**, nunca qual
  pele o usa: `ehPapel` compila e devolve o mesmo defeito na pele seguinte.
  `src/home/capas/registro.test.ts` recusa arquivo de `src/home` ou `src/components` que
  volte a decidir pelo NOME da pele.

  **E entre as duas de hoje existe hierarquia — decidida em 6 de setembro.** Duas peles
  se pagam duas vezes em tudo, e o preço apareceu: quinze cenas de cabeçalho vezes duas,
  quatro paletas, e sete acentos do Orgânico que viveram algumas horas registrados como
  exceção da régua de legibilidade. Então o **Papel é o produto e o Orgânico é a opção**:
  cena nova, peça nova e cor nova saem no Papel primeiro, e o Orgânico segue depois — em
  vez de um travar o outro. Isso não reduz o ponto de extensão em nada: o que uma pele
  nova escreve continua sendo os traços e a roupa da capa. O que muda é a **ordem**, para
  o trabalho não parar esperando o par.

- **A carga é UM evento — e o app do entregador vem depois, por outro motivo.**
  Decisão do dono, 6 de setembro. Carregar e entregar continuam sendo o mesmo
  toque na fábrica; a viagem com linha do tempo (o entregador marcando a chegada
  do celular dele) fica como configuração para quando existir entregador que não
  é quem carregou. Isso fecha os itens 4, 5 e 6 do F3 com escopo pequeno.

  **Mas o "app do entregador" continua na fila, e não é sobre a viagem: é login e
  perfil** — *"pq isso é necessário para algum outro usuário q vai comprar o
  aplicativo"*. Ou seja, a próxima construção é a camada de gente e permissão, não
  a tela de entrega.

- **Operador é PESSOA, não conta — e o esquema dizia o contrário.** Achado ao ir
  construir, 6 de setembro. A `0014` criou `movements.operator_id` referenciando
  `memberships(id)`, e `memberships.user_id` é `not null references auth.users` —
  ou seja, cada pessoa nomeável precisaria de uma conta de autenticação. Isso
  contradiz a decisão de que *"o login autentica o sistema, não a pessoa"*: quem
  entra pela grade de nomes com PIN não tem conta nenhuma.

  A janela para consertar é agora e é de graça: **nada escreve `operator_id`**
  (`app/(tabs)/more.tsx:49` já registrava a lacuna — *"coluna sem tabela de gente
  atrás"*) e não há um único movimento gravado em servidor nenhum. Então entra uma
  tabela de **gente** (sem conta), `operator_id` passa a apontar para ela, e
  `membership` continua sendo o que sempre foi: uma CONTA, que pode apontar para
  uma pessoa. Migração nova, nunca edição das que já existem.

- **A entrada do entregador é um PRAZO, não uma senha eterna.** Desenho proposto pelo
  dono em 6 de setembro, e ele conserta o que o estudo tinha dado como insolúvel:
  não se alcança um celular perdido, mas se faz o celular **parar de confiar em si
  mesmo**. O acesso vale até uma data; cada contato renova; sem contato por N dias,
  o aparelho se tranca e pede matrícula nova. Três ajustes ficaram registrados em
  `docs/estudo-entrada.md`: o que roda todo dia é o prazo e não o PIN, o sinal de
  vida é do entregador para o servidor (e não de um celular para o outro), e o
  prazo aparece na tela antes de vencer. **É esta peça que decide quando o servidor
  sobe** — é o primeiro caso que não funciona offline.

- **Perfil é dado, com os de hoje como sugestão.** O dono cria perfis e marca
  permissão por permissão; `owner`, `operator`, `driver`, `buyer`, `customer` e
  `salesperson` continuam existindo como **modelos prontos**, não como a lista
  fechada. É mudança de esquema, e por isso entra com cuidado (P3).

- **O assistente pode ganhar um LLM pequeno rodando no aparelho.** Pergunta do
  dono, e ela é boa: modelo local resolve o custo por pergunta e o offline da
  câmara fria de uma vez. Fica a exigência junto: **um jeito de impedir
  alucinação** — a resposta continua tendo de abrir a conta, como a de hoje abre.

- **Sensor: aberto a todos os protocolos, sem escolher aparelho.** O dono quer
  até construir o dele com ESP32. Então a `readings` fica genérica (tipo, valor,
  unidade, quem mediu, quando mediu no mundo) e nenhum protocolo entra chumbado.

- **O aplicativo é para encher os olhos — e isso é requisito, não enfeite.** Cobrado
  pelo dono em 6 de setembro, depois de *"perdi as contas de quantas vezes eu te
  pedi"*: *"o app tem q ser uma obra de arte, fantástico, algo que enche os olhos!
  Extrapola, e coloca as animações q cansei de te pedir. quero em todas as telas. dá
  mais cor para o tema papel q está bonito, mas um tanto apagado. estamos usando uma
  paleta pastel, mas pode usar algo mais forte uma vez ou outra se nao quebrar a
  harmonia geral. todo o sistema funciona como um organismo vivo e vc já viu organismo
  vivo MORTO?"*

  Três consequências, e nenhuma delas é opinião minha:

  1. **Movimento em toda tela, não só na capa.** Entrada em cascata, resposta ao toque,
     número que anda até o valor, transição entre telas. Tela que aparece pronta e
     imóvel está errada, mesmo que todos os números estejam certos.
  2. **O Papel ganha cor.** A paleta pastel fica, e o acento forte é permitido de vez em
     quando — o limite é a harmonia, não a timidez.
  3. **"A ausência é dado" não autoriza tela morta.** A cena da fábrica só mexia três
     peças quando havia produção, carga ou tacho aberto, e num domingo o desenho ficava
     idêntico ao de uma empresa recém-instalada. O fato continua mandando no que a
     *cena conta*; o que não pode é o aplicativo **parecer desligado**. Vida é ambiente
     — o que se mexe sem afirmar nada sobre o razão.

  **E "vida é ambiente" não autoriza vocabulário de outro mundo — cobrado pelo dono em
  7 de setembro.** Eu enchi o vão de um cabeçalho com três árvores e dois pássaros, e
  ele perguntou o que aquilo tem a ver com Ajustes: *"o app nao é aplicativo de
  biologia. é produção, controle, transporte, financeiro..."*. O defeito não é o
  desenho ser feio, é ser **decoração** — o alerta inventado virado para o desenho, e
  ensina a mesma coisa: a não olhar. Um horizonte de fábrica se enche com silo, galpão
  e poste. Se a única coisa que ocorre para encher um vão é natureza, o problema não é
  o vão: é que não se perguntou de que mundo a tela é.

  E a regra de leitura que sai daqui, porque ela já me pegou uma vez: quando a tela
  parecer morta, a primeira hipótese **não** é "está certo, é dado" — é que falta vida.

  **O porquê, dito por ele quando perguntei:** *"o ser humano ama o belo e alguns mais
  ainda. Isso vende."* Então beleza aqui não é acabamento, é duas coisas de negócio.
  Dentro da fábrica, é adoção: este arquivo já diz que equipe que vê o app como inimigo
  sabota o dado, e aplicativo feio na câmara fria não é usado com má vontade — é
  **pulado**. A contagem não acontece, a perda não é anotada, e três meses depois o
  saldo é ficção. Tudo o que se construiu para proteger um número — o razão que não
  deixa apagar, o centavo inteiro, a permissão na consulta — só vale se alguém tocar na
  tela de manhã. Fora da fábrica, é venda: ninguém compra um sistema de gestão olhando
  a migração `0040`.

  **E a segunda metade, que ele fez questão de separar da primeira:** *"O belo vende
  sim, mas o que faz permanecer é a qualidade."* São dois momentos diferentes e dois
  compradores diferentes — o que decide na loja e o que decide na renovação. Beleza
  ganha a primeira compra, porque é a única evidência que alguém consegue avaliar em
  dois segundos. **Qualidade ganha a segunda**, e a segunda é a que paga: quem já
  comprou não olha mais a tela inicial com olhos de comprador, olha com olhos de quem
  depende do número.

  A consequência para mim é uma regra de decisão, e ela vale nas duas direções:
  **nunca trocar correção por aparência**, porque o bonito que erra é pior que o
  simples que acerta — o cliente já pagou, e o que ele descobre é que foi enganado.
  E nunca usar isso como desculpa para entregar feio: as duas são obrigatórias, e
  quando parecerem brigar é quase sempre porque uma delas foi mal feita. A cena da
  capa é a prova de que dá para ter as duas — ela é bonita **porque** diz o que
  aconteceu.

  **E a regra de desenho que saiu de uma correção dele**, em três palavras — *"feio"* —
  sobre uma fileira de quatro lojas idênticas: **repetição regular lê como padrão de
  papel de parede, não como coisa.** Vale para qualquer cena. O conserto é sempre o
  mesmo e são três: tamanhos diferentes, vãos desiguais, e **uma só peça com cor** —
  cor alternando em todo elemento é cor que não quer dizer nada. O mesmo defeito estava
  na cena da gente e foi corrigido sem ele precisar repetir, que é o que a correção
  dele deveria comprar.

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

**Exercitar o app é seguir o CAMINHO de quem usa, não visitar telas.** Em 6 de
setembro sete defeitos apareceram numa noite com a barra verde, e dois deles não
apareceriam abrindo telas isoladas. A separação parecia um estado vazio normal —
até eu chegar nela **vindo de uma produção**, com picolé no estoque e nenhum lugar
para mandá-lo; aí o cabeçalho sem conteúdo e o *"essa loja"* sem loja viraram o que
são. E onde houver número, **faça a conta na mão**: 506 × R$ 0,64 não bateu com o
R$ 625,27 da tela, e a aritmética de cabeça é a única régua que não compartilha os
erros do código que produziu o número.

**Conserto de pele não termina no arquivo que o mostrou.** Em 7 de setembro o dono
mandou duas correções em poucas horas e as duas eram a mesma frase com outro sujeito:
o cabeçalho vivo desenhava a geometria do Papel dentro do Orgânico, e o cartão de
toda tela desenhava a caixa de antes de existir `Tracos`. Nos dois casos **a capa já
estava certa** — `src/home/capas/` existe justamente porque *"o Orgânico era o Papel
com a cena trocada"* foi recusado uma vez — e o resto ficou para trás, porque a
pergunta seguinte nunca foi feita. Então ela vira regra: quando uma peça passa a
perguntar o traço, a rodada só fecha depois de `grep` pelo que MAIS desenha aquilo.
Uma pele consertada em um lugar é uma pele consertada em um lugar.

**E a regra já se pagou no mesmo dia em que foi escrita:** procurando o que MAIS
estava só na capa, apareceu o `CountUp` — o número que anda até o valor existia em
`src/home/` e em lugar nenhum das vinte telas, com o pedido do dono escrito
(*"quero em todas as telas"*) meses antes. Não foi o dono que achou desta vez.

**E o defeito de pele mora onde a outra pele não tem como tê-lo.** A cunha na quina
do cartão só existia no Orgânico: ela nasce de borda grossa de um lado com canto
arredondado, e o Papel não tem canto nem caixa. Olhar a pele padrão e concluir "está
bom" é olhar exatamente a metade onde o defeito não cabe.

**Antes de construir o próximo item da lista, meça a afirmação dele contra o código.**
Em 7 de setembro peguei a próxima coisa da fila quatro vezes, e nas quatro o código já
tinha a coisa pronta: o estorno alcançável de qualquer ato, as três configurações de
empresa com leitor, o `[por quê?]` da receita, a conta das perdas já aberta na página.
O defeito não é a documentação envelhecer — é a lista ser **a entrada de um laço
automático** ("nunca ocioso: pegue a próxima da lista escrita") e ninguém medir o que
ela afirma. Um `grep` pelo chamador custa dez segundos. E ela erra nas duas direções:
no mesmo dia, o item que a lista dava como FEITO — o cabeçalho vivo do Orgânico — foi o
que o dono achou quebrado na foto.

**A Lei 6 não pede uma folha; pede que a conta seja alcançável.** A folha do
`[por quê?]` é o mecanismo para quando a conta **não cabe na página** — onde cabe, ela
fica à vista, e trocar uma lista visível por um gesto escondido é piorar cumprindo a
regra. Isso só apareceu ao ir ligar a terceira tela e encontrar a conta já aberta nela.

**Detector novo não reporta nada antes de passar num caso verdadeiro e num
falso.** A régua descartável — o `grep` que conta, o script que varre uma vez para
responder uma pergunta — não passa por CI, não tem guard, e fala direto com o dono.
É a menos verificada e a mais exposta. Em 6 de setembro duas dela erraram na mesma
sessão: "34 alvos de toque sem rótulo" (um `=>` terminando a expressão regular; a
resposta real era **zero**) e coordenadas de cena fora do chão (comandos SVG
relativos lidos como absolutos). O projeto já exige teste positivo e negativo de
todo guard do repositório; a exigência vale igual para a medida de uma vez. **Antes
de dizer um número, rode a régua contra um caso que você sabe que ela deve pegar e
um que ela não deve** — se ela não distinguir os dois, o número não existe.

**Asserção sobre número calculado é igualdade contra outra fonte, nunca `> 0`.**
Em 6 de setembro o extrato mostrou uma corrida de 506 picolés por R$ 625,27 quando
ela fez R$ 323,84 — o consumo somado junto, o mesmo dinheiro contado duas vezes. O
teste existia e estava verde, e a asserção era `assert.ok(valor > 0)` com a
mensagem *"o dinheiro do ato é a soma em módulo"* ao lado. **Qualquer soma satisfaz
"maior que zero"**: escrevi a explicação certa junto de uma checagem que não checa
nada, e li o verde como prova da régua. Se a única coisa que se sabe afirmar é "é
positivo", o que está sendo testado é que a função devolveu alguma coisa — e isso o
typecheck já dá de graça.

**Comentário que se declara único não é o mesmo que ser único.** `amountOf` diz de
si *"the one place rounding happens"*, e `repository.ts` — que o importa na
primeira linha — chamava `cents(rate * qty)` em dois outros lugares, cada um com o
comentário *"arredondada aqui e só aqui"*. Três declarações de unicidade, dois
autores de fato, e todas verdes porque hoje dão o mesmo número. Onde a doutrina diz
"só num lugar", o que prova não é o comentário: é `grep` pelos outros.

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
