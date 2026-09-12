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
ajudando.** Ela existia por um motivo certo e virou atrito — `mutate` era seis
minutos, o `e2e` mais três, e o portão reclama de coisa que não tem relação com o
que mudou. Rodadas inteiras foram gastas servindo a barra em vez de servir o app.

**E esses dois números envelheceram, medidos em 12 de setembro: `mutate` é 28 min 39 s e
`e2e:fast` é 6 min 12 s.** Não é regressão da ferramenta, é aritmética que cresce com o
projeto: a oficina roda a suíte INTEIRA por mutação, então o custo dela é *(mutações) ×
(duração da suíte) ÷ (frentes)*, e os dois primeiros fatores só sobem — 139 mutações e uma
suíte de 773 testes hoje, contra 64 e 338 quando o número de seis minutos foi medido. A suíte
sozinha continua barata: **11,6 s** com a máquina livre, 19,4 s com a oficina rodando por cima.

Isto importa porque o número é o que alguém usa para decidir se roda. Quem lê "seis minutos"
dispara a oficina no meio da rodada — que é justamente o que a regra do `mutate` por último
proíbe, três seções abaixo, e por este motivo.

Nada foi apagado. O que mudou é **quando** cada coisa roda:

| O que mudou | O que roda antes de dizer que está pronto |
|---|---|
| Ambiente, script, documentação, design | **nada** — o que prova é a coisa funcionar. *Uma exceção, medida em 9 de setembro: ver abaixo.* |
| Tela ou componente | compila + **a foto no emulador** |
| Domínio, dados — onde mora dinheiro e saldo | `typecheck` + `npm test` |
| **Migração** (`supabase/migrations/` ou o `MIGRATIONS` do aparelho) | `typecheck` + `npm test` + **`npm run db:verify`** |
| Fechar uma etapa, abrir PR para `main` | a barra inteira, uma vez |

A barra inteira, quando for a vez dela:

```bash
npm run typecheck
npm run lint
npm test
npm run mutate       # quebra o código de propósito: a suíte morde mesmo?
npm run e2e:fast     # o app dirigido num navegador de verdade, em quatro fatias
npm run db:verify    # Postgres descartável, trinta e duas garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

**A exceção da linha "nada", e ela me pegou no dia em que eu a li — 9 de setembro.**
Empurrei um script novo (`scripts/prancha.mjs`, cem linhas) sem rodar a suíte, exatamente
como a primeira linha da tabela autoriza. O CI ficou vermelho: `src/bar.test.ts` mede o
**tamanho do repositório inteiro** contra o número escrito no `docs/roadmap.md`, com folga
de 10% — e cem linhas foram o que faltava para cruzá-la.

A linha da tabela continua certa no espírito: script não precisa de mutação, de navegador
nem de banco. O que ela esquece é que **este repositório tem guardas que medem o próprio
repositório** — contagem de linhas, contagem de testes, contagem de garantias. Qualquer
arquivo acrescentado mexe nelas, inclusive um `.md`.

Então a regra fica: **arquivo novo, de qualquer tipo, roda `npm test` antes do push.**
Edição dentro de um arquivo que já existe segue a tabela. É barato — nove segundos — e o
que ele pega não é o script: é o documento que envelheceu por causa dele.

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
3. **A prova é a comparação, não a foto.** `node scripts/aparelho.mjs fotos <nome>
   <rota>` tira a mesma tela em cinco larguras — telefone pequeno, telefone, telefone
   grande, tablet e tablet deitado — trocando `wm size`/`wm density` sem reiniciar. Uma
   foto isolada não responde "adapta?"; cinco lado a lado respondem.

   **E a ROTA é obrigatória para qualquer tela que não seja a capa — cicatriz de 9 de
   setembro.** Esta linha prometia isso desde que foi escrita e o comando não fazia:
   trocar a largura é mudança de configuração, o Android recria a Activity, e o app
   volta para o início. As cinco fotos saíam da mesma tela — cinco capas — e o comando
   saía zero. Fotografar `recipes/new` em cinco larguras devolveu cinco vezes a capa
   sem uma palavra de aviso. Hoje o segundo argumento é a rota, e ela é reaberta por
   ligação profunda (`norva://<rota>`) DEPOIS de cada troca de largura. Navegar por
   toque em coordenada não serve aqui: quebra quando o layout muda, que é justamente
   o que se está medindo.

   **E a metade que CONFERE isso estava cega — medido em 9 de setembro, consertado em
   11.** Quem deveria pegar "a rota não pegou numa das cinco" é `mesmaTelaEmTodas`,
   comparando o texto da tela lido por `uiautomator`. Só que com o movimento de ambiente
   rodando — que é o estado normal do aplicativo — o `uiautomator` não lê nada: falhou
   três vezes em três, e uma delas disse por quê, `ERROR: could not get idle state`. A
   janela nunca fica ociosa. O `try/catch` de `oQueDizATela()` transformava isso em lista
   vazia, e `mesmaTelaEmTodas([])` respondia **"iguais"** — a guarda não podia falhar, que
   é exatamente o defeito que este arquivo proíbe duas seções abaixo.

   **E o conserto veio em duas etapas no mesmo dia, porque a primeira parou cedo.**
   A primeira foi parar de responder o que não se sabe: o veredito ganhou TRÊS respostas
   (`scripts/leitura.mjs`), e `nao-sei` sai como aviso alto dizendo quantas das cinco
   foram lidas, sem derrubar o comando — as fotos são o que se veio buscar e elas saíram.
   Isso foi escrito acreditando que LER era impossível até o orçamento de movimento
   fechar, que é decisão do dono.

   A segunda foi medir essa crença, e ela estava meia errada. Uma variável só, a mesma
   tela, a mesma sessão:

   | movimento | leituras da tela |
   |---|---|
   | desligado | **3 de 3**, 13–14 s cada |
   | ligado | **0 de 3**, desistindo em 21–23 s |

   Então a leitura não depende de decisão nenhuma: depende de o comando **desligar o
   movimento de propósito** e devolver. É o que uma sessão de 10 de setembro já tinha
   achado na mão e escrito no `docs/insights.md` — e `transition_animation_scale`
   aparecia **uma vez no repositório inteiro, em prosa**, em ferramenta nenhuma. Achado
   sem consequência é achado que não aconteceu.

   Hoje `fotos <nome> <rota>` desliga, lê, confere e devolve (`semMovimento`, com
   `finally`), e diz na tela que fez isso. O `foto` singular **não** mexe em nada: ele é o
   verbo de "como esta tela está", e para isso o aplicativo tem de estar vivo.

   E a resposta do meio é a que faz a diferença valer: **quatro larguras lidas e iguais,
   uma ilegível, não é "iguais"** — a ilegível pode ser justamente a que não navegou, e é
   para ela que a guarda existe. Duas lidas e DIFERENTES, essas já derrubam: diferença
   achada é fato, ausência de diferença entre duas de cinco não é.

   Então continua valendo: a rota é obrigatória, a reabertura por ligação profunda
   funciona, e **a conferência automática ainda não lê** — mas agora ela diz isso em vez
   de aprovar. Quando o aviso aparecer, confira olhando as cinco.

4. **A ferramenta que troca a largura DEIXA a largura trocada.** `wm density` é
   persistente: em 7 de setembro o emulador estava preso em 240 dpi de um teste
   antigo, e eu passei a sessão inteira lendo **720 dp — tablets** — como se fossem
   telefones, medindo margens e julgando composição na largura errada. A foto não
   avisa: ela sai 1080 px de qualquer jeito, e 1080 px é 393 dp ou 720 dp conforme
   uma variável que ninguém vê no retrato. **Antes de olhar qualquer foto, `adb
   shell wm density` e a conta** — e `wm density reset` ao terminar de comparar
   larguras, sempre, porque quem esquecer envenena a próxima sessão inteira.

5. **E a IRMÃ da densidade, medida em 11 de setembro: o MOVIMENTO também é
   persistente, e ele decide qual aplicativo aparece na foto.** O emulador estava com
   `transition_animation_scale`, `window_animation_scale` e `animator_duration_scale`
   todas em **0**, e o `settings_global.xml` diz quem fez: `value="0" package="root"
   defaultValue="1.0"`. Ou seja, a imagem **não** vem assim — uma sessão ligou "reduzir
   movimento" na mão para conseguir ler a árvore de acessibilidade, não devolveu, e o
   instantâneo guardou.

   O custo é maior que o da densidade. `transition_animation_scale = 0` é exatamente o
   que o React Native devolve como `AccessibilityInfo.isReduceMotionEnabled()`, que
   `src/components/vida.ts` lê para **parar as animações** — conferido na fonte que está
   no disco, `AccessibilityInfoModule.kt:100-115`, e ela lê **só** essa chave (as outras
   duas param o Android e não chegam ao aplicativo; a régua que não separasse as duas
   diria "o app está parado" quando não está). Então não era só o Android
   sem transição: **o aplicativo fotografado era o aplicativo desligado** — e o requisito
   do dono é o oposto, com todas as letras (*"vc já viu organismo vivo MORTO?"*). São
   **doze** componentes que leem esse sinal — `Reveal`, `Alive`, `Vivo`, `FactoryScene`,
   `Sky`, `Bars`, `Drain`, `PulseDot`, `CountUp`, `Sparkline`, `Capa`, `Peca` —, ou seja,
   o sistema de movimento inteiro.

   **E o que explica ninguém ter notado é que nada denuncia.** Um quadro parado de um
   app que se mexe é idêntico a um quadro de um app que não se mexe, e o estado não
   aparece no retrato — do mesmo jeito que 1080 px não diz se são 393 dp ou 720 dp. As
   fotos continuaram certas sobre LAYOUT e mudas sobre VIDA, que é o requisito que o dono
   mais cobra; e quem olha uma foto não tem como saber qual das duas coisas está vendo.

   A ferramenta devolve o que a ferramenta troca — `wm size` e `wm density` voltam em
   `tela('original')`. **Ninguém devolve o que uma sessão troca na mão**, e é por isso
   que o conserto não é restaurar (restaurar o que não se sabe quem mudou é adivinhar):
   toda foto passa a trazer o estado do movimento na legenda, ao lado do dp, e só grita
   no caso anormal — `⚠ SEM MOVIMENTO (o app está em "reduzir movimento")`. Vale a mesma
   frase da regra 4: regra escrita não impede, o que impede é o aviso estar na frente de
   quem olha.

**E migração não se prova com teste — cicatriz de 7 de setembro.** A linha da tabela
dizia *"domínio, dados, migração → typecheck + npm test"*, e uma migração de vinte
linhas passou por 491 testes verdes e pelo portão carregando **três** defeitos que só
um Postgres de verdade acusa: expressão dentro de `unique (...)` de tabela (que só
existe em índice), duas ajudantes de política chamadas sem o esquema `private` (a
forma da `0001`, revogada na `0005`), e a falta do `grant` para o papel do
aplicativo — sem ele a fila inteira é recusada por permissão. Nenhum dos três é
visível de dentro do aparelho: o SQLite não tem política, não tem esquema e não tem
papel. **Quem toca migração roda o `db:verify` antes de empurrar**, e ele leva um
minuto.

**Cena é SVG, e SVG se prova no navegador em segundos — 9 de setembro.** O ciclo para
olhar um desenho do cabeçalho era compilar (4 min), instalar (1 min) e esperar o app subir
(1 min no emulador por software). A prancha é geometria pura: extrair os `d=` da função da
cena, montar um `<svg>` com as três tintas da pele e tirar a foto com o Chromium que já
está instalado responde a mesma pergunta em **cinco segundos**, e ampliada — foi assim que
"as colheres viraram funil" apareceu, coisa que a foto do aparelho a 393 dp não mostra.

A borda, para não virar atalho: isso prova **geometria e composição**, e mais nada. Não
prova cor de tema, não prova o encaixe no cabeçalho, não prova animação, e não substitui a
foto do aparelho para nada que não seja a prancha. Quem trocar uma pela outra vai acertar o
desenho e errar a tela.

**E a causa das fotos pretas FICOU ESTABELECIDA — 11 de setembro, e ela é pior que uma
ferramenta quebrada: o emulador deste container se mata a cada ~4 minutos.** A cadeia,
medida inteira e três vezes em três:

```
ANR of com.android.networkstack.process in 17621ms, latency 76340ms
  -> Process com.android.networkstack.process has died: pers PER
  -> FATAL EXCEPTION IN SYSTEM PROCESS: java.lang.IllegalStateException: Lost network stack
  -> tudo reinicia
```

Um processo PERSISTENTE do sistema levou **76 segundos** para responder, o Android o matou
por ANR, e o `system_server` se mata de propósito quando perde o módulo de rede. Às 16:23:50,
16:28:33 e 16:32:12 — de quatro em quatro minutos, com **9 GB livres no hospedeiro**, então
não é memória.

É o mesmo emulador glacial que a seção do ANR acima já descreve (*"o gerenciador de janelas
a 111% e quase todo em kernel, num emulador sem KVM e com GPU por software"*), e agora o
efeito tem nome. E isso explica o que estava aberto sem causa: `DRAW_PENDING` repetido,
`Screen frozen for +3s`, ~80 mil objetos coletados por meio segundo e quadro preto **não são
defeito do aplicativo nem da ferramenta de foto** — é um sistema que nunca termina de nascer.

Três consequências práticas:

1. **`sys.boot_completed` = 1 com ZERO serviços é estado normal aqui**, não paradoxo: a
   propriedade sobrevive à morte do `system_server`. Medido: `getprop` devolvia 1 e
   `service check package|window|activity` devolvia `not found` nos três.
2. **O `instalar` falha com `Broken pipe (32)` ou `Can't find service: package` por isso**, e
   a cicatriz escrita no `subir` (*"o emulador não está quebrado, está GLACIAL"*) estava
   certa e incompleta — não é só lento, é lento o bastante para o próprio Android desistir.
3. **Então a prova de tela neste container é o NAVEGADOR até isto ser contornado**, e ele
   prova o que pode: que a tela monta, que o dicionário tem as chaves, que o fluxo anda.
   O que ele não alcança continua na lista de baixo, e continua sendo do aparelho do dono.

**E o contorno JÁ ESTAVA ACHADO, fechado no roadmap desde 10 de setembro — e o padrão do
script nunca mudou.** Eu o escrevi acima como "hipótese não tentada", gastei uma compilação,
um boot e uma instalação redescobrindo-o, e o item 26 do `docs/roadmap.md` já dizia *"a
imagem `aosp_atd` instala de primeira"* com oito hipóteses derrubadas ao lado.

É a regra desta casa virada contra ela mesma: **achado sem consequência é achado que não
aconteceu** — a mesma frase que este arquivo usa para o `transition_animation_scale` que
aparecia "uma vez no repositório inteiro, em prosa, em ferramenta nenhuma". A conclusão
estava escrita, e `scripts/aparelho.mjs` continuava com `norva-cheio` no padrão. Hoje o
padrão é o ATD, que é o que fecha o laço.

A medida de hoje, que vale como repetição independente:

| | `norva-cheio` | `norva-atd` |
|---|---|---|
| boot | 396 s | **233 s** |
| quedas do `system_server` | **3 em 9 min** | **0 em 20 min** |
| `adb install` do APK de 29 MB | recusado (`Broken pipe`, `Can't find service`) | **Success, em 164 s** |
| `Total frames rendered` | 0 | **0** |

Então o ATD **resolve a instalação** e é o AVD a usar daqui em diante. E a última linha é a
que importa para o pensamento: **o quadro preto NÃO era efeito da queda.** Num sistema
estável, sem uma única queda, o aplicativo sobe, a `MainActivity` fica em primeiro plano,
o `SurfaceFlinger` aloca a camada dele no tamanho certo — `1080 x 2340, 9871 KiB` — e
**nenhum quadro é desenhado**. A superfície existe e nunca é preenchida.

O que já foi ELIMINADO por medida, e é o valor real desta caçada:

1. a troca de largura (`wm size`) — as duas condições mortas, 10 de setembro;
2. o "reduzir movimento" — as fotos saíram pretas com ele desligado;
3. **a queda do `system_server`** — mesmo sintoma num sistema sem quedas;
4. superfície ausente ou de tamanho zero — o buffer está alocado e correto.

E o que sobra medido junto: o processo do aplicativo coleta **~125 mil objetos a cada nove
segundos**, para sempre, desenhando nada. Isso acontece num sistema estável, então também
não é consequência da queda.

**E ela FICOU estabelecida na mesma noite, com uma variável por vez.** A tabela, mesmo AVD,
mesmo APK, mesma rota (`norva://fiz`), com `am force-stop` entre as condições porque
`vida.ts` guarda a resposta de reduzir-movimento uma vez por sessão:

| | `transition` | `window` | `animator` | quadros |
|---|---|---|---|---|
| tudo ligado | 1 | 1 | 1 | **0** |
| só o APP parado | 0 | 1 | 1 | **0** |
| tudo parado | 0 | 0 | 0 | **0** |

**O movimento não é a causa** — quinta eliminação, e ela derruba o candidato que parecia
óbvio desde o começo. E o que a mesma sessão mostrou é o que fecha o assunto:

- a **árvore** lê inteira e certa: `COMECE PELO FIM`, `O que você fez?`, `O QUE SAIU`,
  `QUANTAS UNIDADES`, `Continuar` — a tela de `app/fiz.tsx`, em português, aberta por
  ligação profunda;
- a **captura do convidado funciona**: PNG válido, 1080x2340, 15 KB;
- e o conteúdo dela é **uma cor só, preto**, com `Total frames rendered: 0`.

Então: **nesta imagem o aplicativo monta e nunca é rasterizado.** A captura não está
quebrada; a rasterização não acontece. `aosp_atd` é imagem de instrumentação, e prova de
IMAGEM não existe nela.

**A consequência, e ela muda uma regra deste arquivo:** neste container quem prova tela é a
**árvore** — layout, texto, idioma, dado e navegação, que é bastante e é verificável. O que
ela não alcança é **composição, cor e movimento**, e isso não tem instrumento aqui: é o
aparelho do dono, e não se finge o contrário. `foto` passou a dizer exatamente isso quando o
quadro sai morto, apontando para `ler` em vez de mandar conferir `gfxinfo`.

*O que continua sem resposta, e é uma pergunta menor: se a imagem completa rasterizaria. Não
dá para medir hoje — nela o APK não instala.*

**E o item 26 afirma *"o aplicativo instala, abre e DESENHA"* com prova de árvore de
acessibilidade** — que prova que a árvore React montou, não que um quadro foi para a tela. A
medida de hoje, no mesmo AVD, separa as duas: a árvore monta (a `MainActivity` fica em
primeiro plano, o buffer é alocado no tamanho certo) e `Total frames rendered` é **0**. As
duas afirmações são compatíveis; a palavra "desenha" é que era mais larga que a régua dela.
Mais uma da mesma família, e esta eu não tinha escrito — herdei.

*E uma ironia que se paga escrever: o rastro da partida do ATD, que teria a linha do
renderizador escolhido, foi apagado por mim — a segunda partida truncou o arquivo de nome
fixo, que é exatamente o defeito que eu consertei uma hora depois. A prova morreu por causa
da coisa que o conserto existe para impedir.*

**E a regra que vale mais que todas elas juntas: verde não prova tela.** O tema
claro ilegível que chegou ao dono passou por 338 testes verdes e 36 checagens de
navegador. O que prova tela é a **foto do emulador**, olhada. Isso agora existe:
`bash scripts/ambiente.sh` prepara a máquina e `node scripts/aparelho.mjs` sobe,
instala e fotografa.

**E o NAVEGADOR não prova gesto que o navegador não tem — 11 de setembro, e custou um
item fechado por engano.** O item 6 (*"quem entra por link direto não tem volta"*) foi
fechado com `voltar()`, doze saídas convertidas e uma checagem de navegador nova, verde.
No aparelho o defeito estava inteiro de pé: a medida original foi tirada com `input
keyevent 4` — a **tecla do aparelho** —, e `voltar()` atende a **seta do cabeçalho**. Duas
entradas para o mesmo gesto, a mesma palavra em português, e a checagem ficava verde para
sempre porque `page.click` só alcança a seta.

Então, escrito para ninguém fechar item com verde de navegador outra vez, **o que ele
estruturalmente não alcança**: a tecla ou gesto de voltar do Android · a partida a frio
por intent (`norva://…` com o processo morto) · a rotação · o diálogo de permissão do
sistema · a volta do segundo plano depois de o sistema matar o processo. Item cujo caminho
passa por uma dessas fecha com medida de aparelho, e a medida diz **com que comando** foi
tirada.

**E um item novo nessa lista, que não é gesto — 11 de setembro: CAMPO CONTROLADO cujo valor
derivado não muda.** Uma tela passou a sugerir o fornecedor da última nota, e eu escrevi a
checagem de navegador para prender *"apagar o sugerido fica apagado"*. Plantei o defeito que
ela nomeia — `??` trocado por `||`, que faz a sugestão voltar por cima do campo vazio — e
**ela continuou verde**: com `||` o valor que o React calcula depois de apagar é o mesmo de
antes, então ele não repõe o texto que o Playwright tirou da caixa. React compara propriedade
com propriedade, nunca propriedade com o DOM.

No aparelho o resultado é o oposto, e este repositório já sabia: o docblock de
`src/components/campo.ts` conta a mesma armadilha do outro lado, com número medido — o
`TextInput` do Android repõe o texto nativo quando o valor derivado difere da caixa, e
dezessete letras digitadas viraram "Picole de moran". **O defeito que o navegador não vê é o
que chega ao dedo de quem usa.**

A saída é a mesma dos outros casos desta lista: a régua sai da tela para um módulo puro e as
respostas viram teste de Node, onde a troca reprova na hora. E a regra de método que sai
daqui vale para toda checagem nova: **plante o defeito que a asserção NOMEIA, não um
parecido.** Asserção que sobrevive ao próprio defeito não é fraca, é promessa falsa — e
promessa falsa em teste é pior que teste ausente, porque alguém vai confiar nela. E a checagem barata, quando medida e conserto usam a mesma palavra: pergunte qual
ENTRADA foi medida, e confira se o conserto está no caminho daquele comando.

**E a foto agora MEDE, porque olhada não bastou — 9 de setembro.** A capa do primeiro
dia foi fotografada com a página inteira a **22% de opacidade** (contraste de 1,56:1 num
piso de 4,5:1), e eu olhei essa foto sem ver: desbotado uniforme parece escolha de
desenho, e a miniatura no terminal não denuncia. O que denunciou foi medir pixel na mão,
e o que se acha na mão uma vez não se acha na próxima. Então toda foto agora sai com a
tinta da página ao lado do tamanho — `tinta 15,35:1` —, lida do framebuffer cru, e o
comando grita quando metade da página cai abaixo do piso de texto.

A régua é a **mediana das fitas de cem pixels**, não o pixel mais escuro: a primeira
versão pegava o mais escuro e foi enganada pela BARRA DE ABAS, que tem tinta cheia
enquanto a página está velada — a mesma armadilha da minha primeira medição. Ela foi
provada em doze fotos antes de entrar: as duas veladas em 1,55, as dez sãs de 5,91 a
15,35. **Detector que não distingue os dois casos não entra**, e este quase entrou.

A CI segue a mesma divisão: rápido (tipos, lint, teste, pacote) em todo push;
pesado (mutação, navegador, banco, portão) só indo para `main` ou pelo botão.

**E o custo dessa divisão tem número, medido em 7 de setembro.** A barra inteira rodou
depois de muito tempo e o navegador deu 44 de 49: cinco checagens estavam vermelhas
**desde que a capa emagreceu de quinze peças para sete**, e ninguém viu porque a CI
rápida não abre navegador e a pesada não roda fora de `main`. Nenhuma era defeito do
app — todas mediam, sem querer, "esta peça vem ligada de fábrica". A regra que sai
disso: **mudança no que uma tela mostra por PADRÃO é mudança que o `e2e` faz parte, não
o fechamento.** Quatro minutos de navegador ali, ou semanas de silêncio.

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
- **E o `mutate` LÊ a árvore viva enquanto roda — medido em 12 de setembro.** A seção acima
  diz que ele "nunca mais toca a árvore de trabalho", e isso é verdade sobre ESCREVER: ele
  copia para `.mutate/` e muta a cópia. O que ela não diz é que `julgar()` lê o `original` de
  `process.cwd()` **no instante de julgar cada defeito**, não do instantâneo. Então editar um
  arquivo no meio de uma execução troca o que está sendo medido, defeito por defeito, e sem
  aviso: âncora que eu mudei sai "o trecho mudou" (medida que não houve), e o resto passa a ser
  aplicado à minha versão nova. Nesta sessão eu acrescentei uma função a `src/data/repository.ts`
  com a oficina rodando; o `.mutate/w0` ficou com a minha versão nova contra um `outbox.ts` do
  instantâneo, sem o `export` que ela importa.

  **E eu escrevi aqui, duas horas antes, que isso tinha sido "inofensivo por sorte de módulo" —
  estava errado, e a execução seguinte provou.** O raciocínio era certo sobre o mecanismo que eu
  examinei (sem `"type": "module"` o `tsx` compila para CJS, e import nomeado inexistente vira
  `undefined` em vez de erro de ligação — medido). O que ele não cobria é o caso banal: `julgar()`
  pode ler o arquivo **no meio da minha escrita**. E o efeito apareceu: a mutação do `reversed` do
  extrato saiu **"pega"** na execução que leu a árvore viva e **SOBREVIVENTE** na seguinte, com a
  árvore parada — e a segunda é a verdadeira, reproduzida na mão, 773 testes verdes com o defeito
  plantado. Um falso "pego" sobre um sobrevivente de verdade é o pior resultado que esta
  ferramenta pode dar, porque ele fecha a caça.

  Então a regra não tem borda: **nada de editar fonte enquanto a oficina roda**, e verdicto de uma
  execução que atravessou edições minhas não vale — repita com a árvore parada. Em ESM seria pior
  ainda: a suíte da cópia falharia sem mutação nenhuma e **toda** mutação seguinte sairia "pega"
  sem a suíte ter sido consultada, que é o defeito de 3 de setembro voltando por outra porta. Os
  documentos (`docs/`, `CLAUDE.md`) são copiados no início, então editá-los no meio é seguro — e é
  exatamente o contrário do que a cicatriz anterior sugeria.
- **Asserção SEM MENSAGEM não nomeia defeito nenhum — 12 de setembro.** A régua desta casa manda
  plantar o defeito que a asserção NOMEIA, e eu escrevi
  `assert.equal(tipoDaDiferenca(-500), 'falta')` sem mensagem: plantada a troca de sinal, a
  reprovação diz *"Expected values to be strictly equal"*, que manda quem lê abrir o arquivo para
  descobrir o que quebrou. Com a mensagem ela diz *"contou menos do que veio: é falta"*, e o
  relatório da oficina — que é lido sem o código ao lado — passa a ser legível. Então a regra tem
  duas metades: plante o defeito que a asserção nomeia, **e escreva a mensagem que o nomeia**.
- **Mutação em SQL preserva a CONTAGEM DE PARÂMETROS, ou mede o driver em vez da regra — 12 de
  setembro.** Para provar o portão do nome do operador (`CASE WHEN ? = 1 THEN pe.name END`) eu
  troquei a expressão por `pe.name` — e o teste reprovou com `column index out of range`, do
  SQLite, **antes de qualquer portão ser exercitado**. O veredito "pego" estava certo e não
  queria dizer nada: quem removesse o portão mantendo o `?` — que é o defeito plausível, o de
  quem "simplifica" a consulta — passaria. A troca certa é `CASE WHEN ? = 1 THEN pe.name ELSE
  pe.name END`: o marcador fica, o portão vira nada, e aí o teste reprova dizendo *"sem a chave
  ligada, o nome não sai da consulta"*. É a regra de plantar o defeito que a asserção NOMEIA,
  aplicada ao lado de dentro — a asserção estava boa, a mutação é que media outra coisa.
- **O `mutate` é a ÚLTIMA coisa da rodada, nunca a primeira.** Ele copia a árvore no
  início e ocupa os quatro núcleos por seis minutos. Em 9 de setembro eu o disparei três
  vezes no meio de uma rodada e segui editando e rodando `npm test` por cima: as três
  levaram **de 12 a 17 minutos** em vez de seis, duas fatias do `e2e` saíram vermelhas
  por espera de tempo fixo, e as três mediram uma árvore que eu já tinha mudado — então
  o resultado chegou velho e as âncoras vieram cegas. Dispare-o quando as edições
  acabaram e o resto da barra passou; até lá, a máquina é do trabalho.
- **O EMULADOR não convive com o `e2e`, e isso foi medido em 9 de setembro.** Ele virou
  ferramenta de rotina nesta sessão — sobe, instala o APK, fotografa — e come 4,6 GB e
  núcleos numa máquina de quatro. Rodando junto com as quatro fatias do navegador, uma
  checagem ficou vermelha com a tela devolvendo **texto vazio** (sinal de queda, não de
  frase errada), passou **verde sozinha**, e a suíte inteira deu **53/53** assim que o
  emulador foi derrubado. Três medidas, uma conclusão: é disputa de máquina, não defeito.
  A ordem que sai disso: **derrube o emulador antes de rodar `e2e:fast` ou `mutate`** —
  `adb emu kill`, que é o comando dele e não um `pkill` por padrão. E se uma checagem
  vier vermelha com `Input: ''`, olhe a carga da máquina antes de olhar o código.

  **Mas a disputa NÃO tem uma assinatura só — 11 de setembro.** Duas execuções da mesma
  suíte na mesma noite deram vermelhas diferentes, e as duas passaram sozinhas: uma com
  `Input: ''` (tela vazia, o sinal que esta seção já descrevia) e outra com uma asserção
  específica falhando — *"a escolha da identidade está nos ajustes"* —, que **tem cara de
  defeito de verdade**. Sob disputa a tela às vezes não fica vazia: ela desenha PELA
  METADE, e aí falta o elemento que a checagem procura.

  Então a régua não é a forma da falha, é a **repetição isolada**: `npm run e2e -- --only
  "<trecho>"`, uma vez. Passou sozinha, era disputa; falhou de novo, é código. Julgar pela
  assinatura manda procurar defeito onde não tem — e foi o que quase aconteceu aqui, porque
  a segunda vermelha não parecia disputa nenhuma.

  **E `adb emu kill` RETORNA ANTES de o qemu sair — 10 de setembro.** Derrubei o emulador
  e disparei o `e2e:fast` no mesmo comando: duas fatias vermelhas, três checagens com
  `Input: ''`, e as três passaram **sozinhas** logo depois (`npm run e2e -- --only`). O
  processo levava dezenas de segundos para morrer enquanto quatro fatias já disputavam os
  quatro núcleos com ele. Espere o processo sumir de fato — `ps` pelo PID que você anotou
  — e só então comece. E note a forma da prova: "foi instabilidade" não vale dito, vale
  **medido**, uma checagem por vez.

  **E DIRIGIR o emulador por toque tem um teto próprio, que não é disputa de CPU — 10 de
  setembro, e eu escrevi a causa errada antes de ler o rastro.** Um roteiro que preenche
  um formulário longo levou **três ANR** em duas horas. Os dois primeiros aconteceram com
  `npm test`, lint e o portão rodando junto, e eu registrei aqui que a causa era essa. **O
  terceiro aconteceu com a máquina livre**, e o rastro diz outra coisa:

  ```
  Reason: Input dispatching timed out (... does not have a focused window)
    111% system_server: 26% user + 85% kernel
     36% app.norva.mobile: 18% user + 18% kernel
  ```

  O aplicativo está em 36%. Quem queima é o **gerenciador de janelas do emulador**, a
  111% e quase todo em kernel — a fila de eventos de entrada não é atendida porque o
  `system_server` não dá conta, num emulador sem KVM e com GPU por software. Não é a
  thread de JS, não é a barra rodando junto, e **não é defeito do aplicativo**: as três
  vezes o formulário preenchido zerou e a rodada foi perdida.

  Duas consequências práticas, e a segunda é a que economiza tempo de verdade:

  - **Não rode a barra enquanto o roteiro toca a tela.** Continua valendo — o ANR chega
    mais rápido com a máquina ocupada, e o `uiautomator dump` fica tão lento que o roteiro
    estoura o tempo. Só deixou de ser a causa.
  - **Encurte a rolagem em vez de aguentá-la.** Um formulário de dezesseis telas a 393 dp
    cabe em duas ou três a 720 dp, e `wm density` troca isso em segundos. Menos evento de
    entrada é menos chance de ANR — e de quebra exercita a largura de tablet, que este
    projeto exige medir de qualquer jeito. Lembre do `wm density reset` ao terminar.

  E roteiro de aparelho escreve com `appendFileSync` num arquivo, nunca só `console.log`:
  morto por tempo, o `stdout` do Node se perde e a rodada inteira vira zero linha.

- **Use o verbo do script, não o comando cru por baixo dele — 9 de setembro.** Para
  conferir um conserto de tela eu disparei `./gradlew assembleRelease` direto, e ele foi
  compilar o nativo para as quatro arquiteturas. Passou de meia hora, e o emulador roda
  uma. O `scripts/aparelho.mjs` **já tinha** o verbo `compilar`, que passa
  `-PreactNativeArchitectures=x86_64`, e o docblock dele já contava esta mesma história
  com o número medido — 8 GB de objeto nativo de arquitetura que este emulador nunca vai
  executar.

  Então a lição não é a bandeira: é que a ferramenta do repositório carrega as cicatrizes
  que o comando cru não tem. Antes de digitar `gradlew`, `adb` ou `expo` na mão, olhe se
  o script já tem o verbo — ele existe justamente porque alguém já pagou por fazer na mão.

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
- **Nunca canalize a saída de uma verificação por `tail`, `head` ou `grep` na primeira
  leitura.** Cicatriz de 9 de setembro, e ela é a irmã da regra do `&&`: aquela é sobre o
  **veredito** (o último cano decide o código de saída), esta é sobre a **prova**. Rodei
  `npm run e2e:fast | tail -25`, o relatório disse *"51/53, 2 fatias vermelhas"*, e as
  linhas `FAIL` que diziam QUAIS estavam entre as que eu tinha jogado fora. Passei a
  rodada seguinte melhorando a ferramenta por um diagnóstico errado — "o corredor esconde
  fatia vermelha" — quando quem escondia era o meu comando. A segunda execução, inteira,
  deu 53/53, e aí não dá para dizer nem que foi instabilidade nem que era defeito: **a
  prova não existe mais.** Redirecione para arquivo (`> log 2>&1`) e filtre o arquivo
  depois, quantas vezes quiser.

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

- **Supabase: nada no ar antes de a sincronia existir** — ~~e não havia cliente no
  projeto~~ **valeu até 6 de setembro, quando o servidor subiu.** A regra continua
  sendo a certa e o que a derrubou foi medida, não impaciência: três coisas ficaram
  presas atrás dela ao mesmo tempo (a aprovação de pedido que não atravessa, a
  configuração que vale por aparelho, e a lista de gente sem a qual não há quem
  operou). Hoje `@supabase/supabase-js` está no `package.json` e `src/sync/supabase.ts`
  monta o cliente — nulo quando não há servidor configurado, que é estado legítimo. As
  migrações continuam sendo arquivos versionados, e quem as prova é o `npm run
  db:verify`, que sobe um Postgres descartável e não depende de nuvem nenhuma.

  *Este parágrafo afirmou "não há cliente Supabase no projeto" por um dia depois de o
  cliente existir. Decisão registrada envelhece igual a plano — e como ela é lida em
  toda sessão, o custo dela é maior.*

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
  existir de verdade, o app continua inteiro no aparelho — as migrações são
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
  `src/theme/tokens.ts`, e o tipo é a lista — **não copie os nomes para cá**, porque a
  cópia envelhece: em 7 de setembro nasceu o `cabecalho` e este parágrafo continuou
  citando cinco), que é o que os componentes compartilhados perguntam a ela; e a
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

- **O Reset existe, é do dono, e passa por duas confirmações — decisão do dono, 7 de
  setembro.** *"coloca uma opção de Reset q passa por duas etapas de confirmações do
  usuário explicando isso do registro aí antes de apagar. aí fica a critério do usuário.
  obviamente q apenas o adm pode fazer isso."*

  Isso encerra a pergunta que estava aberta sobre o `erase` — e a resposta não era
  nenhuma das duas que eu tinha oferecido (limpar só no telefone, ou marcador no
  servidor). É uma terceira: **apagar de verdade, com o usuário sabendo exatamente o que
  perde.** A tela é que carrega o peso, não a proibição.

  O que a decisão fixa, e não se repergunta: existe Reset; ele apaga; são **duas**
  confirmações e não uma; a segunda explica **o que o registro é e o que se perde com
  ele**; e só quem tem `manage_company` alcança o botão — nem `operator`, nem aparelho
  emprestado.

  O que ela NÃO decide, porque é engenharia e não produto: *como* o servidor honra isso
  sem que a tranca do razão (`movements_are_immutable`) recuse, se o alcance é a empresa
  inteira ou continua por área, e se o caminho é esvaziar ou aposentar a empresa. É P3 —
  migração, permanente — então a forma é mostrada antes de rodar, mas a decisão de que
  ele existe já está tomada.

  **O prazo é 10 dias corridos — decisão do dono, 7 de setembro.** *"podem ser 10 dias
  corridos."* É o padrão da empresa, e os extremos continuam existindo como
  configuração: zero destrói no ato, "nunca" guarda o livro fechado para sempre. No
  aparelho o apagamento é imediato nos três casos — o prazo é do servidor.

  **E o dono zerando ANTES do lançamento é outro ato, que não depende disto.** Provado
  contra um Postgres com as 43 migrações aplicadas: `DELETE` e `UPDATE` em `movements`
  são recusados **até para o dono do banco** (gatilho de linha), e `TRUNCATE` passa —
  ele não dispara gatilho de linha. Então zerar pelo console do Supabase é `truncate`,
  nunca `delete`, e quem digitar `delete from movements` lá vai achar que o app quebrou.

- **O `Lotify` é ESTUDO, e nada dele entra sem autorização — decisão do dono, 10 de
  setembro.** *"quero apenas q estude o lotify, nao importa nada pro norva sem antes eu
  permitir"*. É a tentativa anterior dele, com a mesma ideia, e ele já disse por que não
  quer o código: *"o projeto é garden de mais. vai atrapalhar aqui enchendo o normal com
  coisa q nao precisa"*.

  Então a fronteira é dura e vale para tudo, não só para código: **nem arquivo, nem
  esquema, nem migração, nem texto de tela, nem nome de campo** atravessa sem ele
  autorizar aquele item. O que a leitura produz é RELATO — o que existe lá, o que aquilo
  sugere, e a pergunta se vale trazer. Ele decide item por item.

  O que a leitura procura, quando ela acontecer, é o que o NORVA não consegue inventar
  sozinho: fato de fábrica de verdade — unidades usadas, tamanho de lote, hierarquia de
  embalagem, validade, vocabulário. Arquitetura de protótipo é passivo dentro de um
  sistema com livro-razão append-only e `Cents`/`Rate`.

- **A cadeia é PRODUTO → CATEGORIA → TIPO → VARIAÇÃO, e nenhum nível de baixo é
  obrigatório — decisão do dono, 11 de setembro.** *"Produto - Categoria 'a', categoria
  'b', categoria 'n'… Tipo 'a', tipo 'b', tipo 'n'… - Variação 'a', Variação 'b',
  Variação 'n'… e tb o produto nao necessariamente requeira todas as 'subclasses'."*

  Isso fecha o item 39 e resolve o que o estudo tinha travado. O problema achado era que
  **"tipo" carregava duas naturezas**: Leite/Água/Skimo são tipos que têm RECEITA própria,
  e 250 ml/500 ml são tipos que são só TAMANHO, com a mesma receita. Dois níveis separados
  resolvem sem obrigar ninguém a usar os dois.

  Na fábrica do pai dele, as duas famílias usam três níveis e deixam um vazio:

  | | Produto | Categoria | Tipo | Variação |
  |---|---|---|---|---|
  | picolé | Picolé | — | Leite, Água, Skimo | Morango, Chocolate… |
  | pote | Pote de sorvete | — | 250 ml, 500 ml | Morango, Chocolate… |

  **Então a Categoria nasce sem exemplo na fábrica dele, e isso é deliberado.** A janela
  para acertar a forma é agora: este arquivo já diz que *"forma de esquema se adivinha de
  graça enquanto há zero linhas"*, e não há uma linha gravada em servidor nenhum. Acrescentar
  o nível depois seria migração sobre dado vivo.

  **E o que torna quatro níveis seguros é a opcionalidade ser de verdade, não promessa.**
  `degraus()` (`src/components/grade.ts`) já devolve `[]` para um nível com uma opção ou
  nenhuma — ele não vira pergunta na tela. Um nível que a fábrica não usa **desaparece**,
  em vez de virar mais um toque. Sem isso, quatro níveis pioram exatamente a queixa que
  abriu esta rodada (*"o app está complicadíssimo de se usar"*).

  **A colisão de palavra, resolvida por mim e dita aqui:** hoje a tela chama de
  **"Produtos"** a lista do que se vende (o SKU: *Picolé de Leite Morango*), e o dono usa
  "Produto" para o TOPO da cadeia — o que hoje se chama "Linha". O topo passa a ser
  **Produto**; o que se vende é a cadeia inteira dita por extenso, não um segundo
  substantivo concorrente.

- **O que cada nível SIGNIFICA, aprovado em 11 de setembro: Categoria muda a RECEITA,
  Tipo muda TAMANHO ou FORMATO, Variação muda o SABOR.** É a metade que faltava da decisão
  da cadeia, e sem ela o nível novo não fazia o trabalho para o qual existe: as duas
  naturezas continuavam em "Tipo" e a Categoria nascia vazia nas duas famílias da fábrica
  dele.

  Com a regra, cada família usa três dos quatro deixando níveis DIFERENTES vazios:

  | | Produto | Categoria *(receita)* | Tipo *(tamanho)* | Variação *(sabor)* |
  |---|---|---|---|---|
  | picolé | Picolé | Leite, Água, Skimo | — | Morango… |
  | pote | Pote de sorvete | — | 250 ml, 500 ml | Morango… |
  | o dia do 60/80 | Picolé | Leite, Água, Skimo | 60 ml, 80 ml | Morango… |

  **O ganho não é organizar melhor hoje: é caber amanhã.** A terceira linha é o dia em que
  o picolé de leite sair em dois tamanhos — hoje isso obrigaria a cadastrar "Leite 60ml" e
  "Leite 80ml" como tipos, que é o nome digitado inteiro que a grade existe para não ter.

  **E a aprovação abriu um buraco na aprovação anterior, medido no mesmo dia.** Com Leite
  virando CATEGORIA, "morango só no leite" ficou inexpressável: a variação só sabia
  estreitar em linha ou em tipo (`0056`), e com o tipo vazio no picolé o morango voltaria a
  ser oferecido no de água — a trava que a `0055` nasceu para dar. Conserto: `0059` dá
  `category_id` à variação, e a regra de aplicação é uma só — **a variação vale num produto
  quando todos os níveis que ela NOMEIA batem; o que ela deixa nulo, ela não exige.**

  **E o segundo buraco era meu, da rodada anterior:** `products.category_id` tinha coluna,
  índice único e leitor (`listProducts`) e **nenhum escritor**. A doença que o portão P1
  existe para pegar, de pé porque o nível nasce vazio na fábrica do dono — quem não usa
  categoria não nota que ela não grava. Ficou bloqueante no instante da aprovação: sem
  escritor, "Picolé de Leite Morango" não tinha como ser gravado.

- **A categoria nasce FECHADA no cadastro — decisão do dono, 11 de setembro.** O cartão
  ficava de pé mesmo vazio, pelo argumento de não esconder o caminho de quem precisa do
  nível, e na fábrica dele isso era um cartão inteiro lendo *"nenhuma categoria aqui — e
  tudo bem"* para sempre. Um convite de uma linha (*"precisa de um corte a mais?"*) não
  esconde caminho: ele o cobra por um toque, de quem de fato vai andar nele. Com categoria
  cadastrada não há convite — não se fecha o que já tem dado dentro.

  A borda, porque ela custa: quem PRECISA do nível paga um toque para descobrir que ele
  existe. Por isso a frase é convite (*"precisa de um corte a mais?"*) e não rótulo
  (*"Categorias"*).

- **Começar pelo fim EXISTE, e o passo a passo continua — decisão do dono, 11 de
  setembro.** *"parece q pode dar margem para erro. Seguir um passo obrigatório q nao muda
  é mais seguro, apesar de mais longo. O que eu acho q podemos fazer e partir dos dois
  lados: inicio e fim, ambos valendo desde que o resultado seja o mesmo. O teu jeito é bom
  para quem é desatento ou algo assim."*

  Os dois caminhos existem, como manda a fundação do "depende". O passo a passo é o
  seguro e continua sendo o padrão; começar pelo fim é a porta alternativa.

  **E ele deu a invariante junto, que é o que torna isto verificável:** *"ambos valendo
  desde que o resultado seja o mesmo"*. Não é conversa — é uma guarda: a mesma produção
  registrada pelos dois caminhos tem de deixar o livro-razão **idêntico**, movimento por
  movimento. Um caminho que produz um razão diferente não é um atalho, é outro ato.

  **O DESENHO foi decidido em 11 de setembro: caminho próprio (`app/fiz.tsx`), com a
  alternativa não descartada.** *"vamos tentar a 'B', mas não descarta a 'A' ainda."* As
  duas formas que estavam na mesa: **A** cria os cadastros dentro da própria tela de
  produção, respeitando a razão escrita dela de não navegar (item 7) e engordando
  permanentemente a tela que a fábrica usa todo dia; **B** é um caminho próprio que começa
  em *"o que você fez?"*, aparece quando serve e desaparece quando não serve.

  Como a invariante é garantida, e é estrutura e não teste de exemplo: **o caminho de trás
  não tem como gravar.** Ele coleta a frase, mostra a escada e encaminha; quem escreve no
  razão é a mesma `app/production/new.tsx` chamando a mesma `recordProduction`.
  `src/caminho.test.ts` cobra as duas metades — nenhuma chamada de gravação em `fiz.tsx`, e
  as quatro portas dos dois caminhos iguais degrau por degrau. Assim a invariante vale para
  toda produção possível, e não para as que alguém lembrou de testar.

  **A intenção mora no `AsyncStorage`, não no banco**, e isso é a medida decidindo a forma:
  intenção não é fato — não tem centavo, não tem saldo, não atravessa para o servidor e não
  vira movimento. Tabela custaria migração (P3) para guardar uma frase que vive minutos. Ela
  vence em sete dias, porque frase de dez dias atrás na tela é o alerta inventado com outro
  rosto.

- **Conferência duplicada: os dois celulares veem, e o primeiro que aceitar fica —
  decisão do dono, 11 de setembro.** *"assim q sincronizarem uma mensagem aparece dizendo
  q tem duplicação de dados, mostra os dados (com a data, horário e local e nome do
  operador, por exemplo) para os dois celulares e o primeiro q aceitar fica como
  permanente."*

  Isso encerra a pergunta que estava aberta, e a resposta **não era nenhuma das três** que
  eu tinha oferecido (desfaz sozinha, fica marcada, avisa depois). É uma quarta: **mostra as
  duas e deixa uma pessoa decidir.**

  O que a decisão fixa: a duplicação **aparece na sincronia**, não fica em silêncio; a tela
  mostra o que distingue as duas (data, hora, local, quem operou); os **dois** celulares
  veem; e a primeira aceitação vira permanente. O que perde é estornado, que é como este
  livro-razão corrige — nunca exclusão.

  O que ela NÃO decide, porque é engenharia: como o transporte classifica a recusa do
  servidor (`PushResult` em `src/sync/engine.ts:31` só diz o que ENTROU), e isso continua
  precisando das formas de erro de um servidor de verdade.

- **Sentry entra depois — decisão do dono, 11 de setembro: *"Farei depois."*** O conector
  está ligado na conta dele e desligado nesta conversa, e ligá-lo é botão dele, não meu.

  Registrado para não virar pergunta repetida, com o que a medida disse junto: o aplicativo
  JÁ detecta e mostra a quebra (`src/components/Crash.tsx`), e o docblock de lá nomeia o
  buraco — *"é a única descrição da falha que vai existir, porque ninguém vai reproduzir isto
  num celular numa câmara fria"*. O que falta não é detecção, é **entrega**: hoje essa
  descrição morre no toque de "Tentar de novo".

  E as três coisas que ele precisa decidir junto, porque nenhuma é padrão:

  1. **O que sai do aparelho.** Relatório de erro carrega rastro, tela e — se for descuidado
     — nome de item, preço, custo e fornecedor. A fundação desta casa é que o dado da fábrica
     é do dono, então a limpeza (`beforeSend` cortando dinheiro, nome e carga, com teste
     provando que corta) se decide ANTES de mandar a primeira linha.
  2. **Desligado por padrão.** Sem DSN configurada o app não manda nada — senão todo cliente
     futuro vira cobaia por um arquivo de ambiente esquecido.
  3. **Ele não fecha o buraco do tablet.** Sentry pega ERRO. Feio, lento e confuso continuam
     precisando dos olhos do dono, e isso não muda.

- **O operador confere a prateleira.** Numa fábrica de seis pessoas quem anda
  até a prateleira é quem trabalha lá, não o dono. Negar a permissão não deixa o
  número mais seguro — deixa a contagem sem acontecer, e saldo que ninguém
  conferiu há meses é pior que saldo corrigido hoje de manhã. O que protege é o
  piso, não a permissão: contagem é perguntada toda vez, e é gravada como
  diferença que o livro-razão guarda, nunca como valor que sobrescreve.

---

**Antes de chamar algo de defeito, procure a decisão.** Três vezes numa sessão eu
apontei "violação de fundação" no que era fronteira registrada: o `UnitStepper`
sem uso (era componente da Fase 2 — **e desde então ganhou tela: `app/picking.tsx:366`
passa `t.stepper` inteiro. A linha fica porque a lição é a mesma, e porque ela mostra
o outro lado: registro de decisão envelhece, e em 10 de setembro este aqui mandou uma
guarda dar por adiantado o que já estava em uso**), o `[por quê?]` ausente na home (a conta abre
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

**E antes de medir o ALVO, meça a RÉGUA — 11 de setembro, três itens numa noite.** A regra
de baixo pergunta se a coisa já existe. Falta a pergunta gêmea, e ela destravou três itens
sem uma linha de aplicativo mudar:

| item | o que dizia travar | o que travava de verdade |
|---|---|---|
| o emulador não instala | oito hipóteses derrubadas | **já resolvido no dia anterior**, e o padrão do script nunca mudou |
| a última linha sob a barra de abas | *"esperando a foto"* | a foto não existe aqui; a árvore respondeu — 360 px de folga |
| o app renderiza errado sob saturação | cinco evidências | **quatro vieram do instrumento que a quinta diz que falha** |

Duas perguntas, então, ao pegar um item:

1. **A prova que este item pede ainda é possível neste ambiente?** Item que espera um
   instrumento que o ambiente perdeu espera para sempre, e ninguém reabre um item para
   perguntar isso.
2. **Quantos INSTRUMENTOS existem por trás das evidências dele?** Quatro observações do
   mesmo instrumento cego são **uma** observação — e a repetição não confirma nada, porque
   é a mesma leitura repetida. Se uma das evidências for *"o instrumento falhou"*, ela não é
   mais um sintoma da lista: é a explicação das outras, e devia ser lida primeiro.

**Antes de construir o próximo item da lista, meça a afirmação dele contra o código.**
Em 7 de setembro peguei a próxima coisa da fila **seis vezes**, e nas seis o código já
tinha a coisa pronta: o estorno alcançável de qualquer ato, as três configurações de
empresa com leitor, o `[por quê?]` da receita, a conta das perdas já aberta na página,
a conta da produção idem, e o aviso de validade já agendado desde a raiz do app.

**E a causa é estrutural, não descuido:** a seção *"As seis"* do roadmap foi escrita
como ASPIRAÇÃO — o que o produto quer ser — e passou a ser lida como FILA pela regra de
nunca ficar ocioso. Aspiração não envelhece sozinha; fila envelhece a cada commit. Uma
lista que mistura as duas manda reconstruir o que existe, e foi o que ela fez seis
vezes numa noite. Item de aspiração sem medida ao lado é convite, não trabalho.
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

**E o caso verdadeiro se confere NO DISCO, não no comando que tentou escrevê-lo — 11 de
setembro.** A regra de cima manda provar o detector nos dois sentidos, e eu a cumpri ao pé
da letra duas vezes seguidas medindo nada. Para mostrar uma guarda de i18n mordendo, devolvi
a frase cravada ao arquivo: na primeira, o `str.replace` procurava um alvo de uma linha num
tipo que é multilinha — não achou nada, devolveu o arquivo intacto e **saiu 0**; na segunda,
a frase que eu inventei não continha nenhuma das dez palavras funcionais que a régua exige,
então o verde estava certo sobre um caso que não era o caso. As duas vezes eu li o verde como
*"a régua não morde"* — e essa conclusão manda consertar uma guarda que estava boa.

**E quando a coisa protegida é o que o APARELHO manda, a garantia se escreve na forma com que
ele manda — 12 de setembro.** A `0051` recusava a RETENTATIVA da própria conferência aceita: a
fila sobe por `on conflict (id) do nothing`, gatilho `before insert` dispara ANTES de o conflito
de id ser detectado, e o `exists` da regra encontrava a própria linha de pé. Um celular sozinho,
sem duplicação nenhuma, tinha a conferência posta de lado **para sempre** — contra a fundação
escrita da fila (*"mandar a mesma entrada duas vezes é inofensivo"*) e contra o docblock da
própria migração (*"a fila de um celular subindo sozinha nunca disputa nada"*).

Duas garantias detalhadas cobriam essa regra, com quatro casos entre elas, e **nenhuma pegou**:
todas usam `insert` cru com id NOVO, que é a forma de quem escreve o teste. O aparelho escreve
com `upsert` e, na retentativa, com o MESMO id. Escrever a garantia na forma do teste em vez da
forma do cliente é medir um cliente que não existe.

**E antes de acrescentar um caso PARCIAL a um sistema que só conhecia o total, procure os
predicados que a totalidade tornava equivalentes.** O primeiro estorno parcial deste projeto
derrubou três de uma vez — `planReversal.alreadyReversed`, o `checked` da doca e a agregação do
extrato —, e os três diziam "alguma perna estornada" quando queriam dizer "nenhuma de pé".
Estavam certos por uma invariante que ninguém escreveu, e nenhum deles daria vermelho sozinho:
os três só falham depois de o caso parcial existir. `grep` pelo conceito custa minutos;
descobrir pelo terceiro sintoma custa a rodada.

**E comentário SQL dentro de template literal escreve identificador SEM acento grave.** Isso
quebrou a compilação três vezes numa sessão, sempre longe da linha editada (`',' expected`,
`Octal literals are not allowed`): em prosa técnica daqui o acento grave é reflexo, e dentro de
um backtick-string ele é delimitador. Uma quarta vez foi no shell, por `python3 -c "…"` com
acento grave dentro de aspas duplas — ali ele é substituição de comando. Prosa com marcação
atravessa três linguagens neste repositório, e em duas delas o acento grave não é decoração.

**Injetor que falha em silêncio produz um verde idêntico ao de uma guarda que funciona.**
Então a injeção é conferida antes de a medida ser lida — `grep` pelo defeito no arquivo, e a
contagem esperada —, e o caso verdadeiro é o **caso real**, não um parecido escrito por mim:
a frase que estava lá, com as palavras que estavam nela. A prova negativa tem o mesmo dever:
depois de restaurar, `grep` de novo, porque defeito esquecido no disco é pior que prova
ausente.


**Guarda que deriva do escopo errado FABRICA o número que o documento repete.** Em 7
de setembro a tabela *"medido, não afirmado"* dizia 18 capacidades e a guarda derivava
18 — do arquivo inteiro do `access.ts`, onde moram as **doze** capacidades e os sete
papéis, seis deles minúsculos e por isso contados junto (`storeManager` escapava só por
ter maiúscula). O documento não foi conferido contra a guarda: foi **escrito a partir
dela**, então os dois concordavam e o verde não significava nada. A regra irmã já estava
escrita — *"uma guarda que compara duas coisas escritas pela mesma mão não guarda
nada"* — e faltava esta: **pergunte de qual RECORTE a derivação lê**, e prefira sempre a
fonte que não passou pela sua mão (aqui, o enum `capability` do Postgres).

**Fronteira dita em voz alta continua sendo fronteira.** O docblock da mesma guarda
admitia que "acrescentar uma linha à tabela sem acrescentar uma entrada aqui não quebra
nada", enquanto o plano prometia que ela cobria todas — e cobria dez de treze, com duas
das três de fora erradas. Honestidade em comentário documenta o buraco para quem lê o
teste; quem lê o documento lê a promessa. **Se a promessa é boa, feche o buraco; se não
é, corrija a promessa.** Não existe terceira saída.

**E o plano carrega a medida junto do item, desde 7 de setembro.** Cada item da fila do
`docs/roadmap.md` e cada linha da tabela *A ORDEM* traz um comentário
`<!-- medida: ausente|presente|espera ... -->` que `src/plano.test.ts` roda: item aberto
prova que a coisa não existe, item fechado prova que existe, e `espera` diz por escrito o
que se espera de fora. No dia em que alguém construir o que a fila dá como aberto, a suíte
fica vermelha — que é a regra 1 do plano ("item fechado sai no mesmo commit que o fecha")
deixando de depender de memória. Uma auditoria adversarial de 7 de setembro contou o
tamanho do problema antes do conserto: **38 contradições de pé, 16 derrubadas.**

**Asserção sobre número calculado é igualdade contra outra fonte, nunca `> 0`.**
Em 6 de setembro o extrato mostrou uma corrida de 506 picolés por R$ 625,27 quando
ela fez R$ 323,84 — o consumo somado junto, o mesmo dinheiro contado duas vezes. O
teste existia e estava verde, e a asserção era `assert.ok(valor > 0)` com a
mensagem *"o dinheiro do ato é a soma em módulo"* ao lado. **Qualquer soma satisfaz
"maior que zero"**: escrevi a explicação certa junto de uma checagem que não checa
nada, e li o verde como prova da régua. Se a única coisa que se sabe afirmar é "é
positivo", o que está sendo testado é que a função devolveu alguma coisa — e isso o
typecheck já dá de graça.

**A segunda fonte tem de ser INDEPENDENTE da primeira — e a forma da linha engana.**
A regra de cima ("igualdade contra outra fonte, nunca `> 0`") tem um buraco que só o
`mutate` acha. Em 7 de setembro o custo congelado de uma corrida perdeu a embalagem e
a suíte inteira passou, porque o teste que afirmava exatamente isso comparava
`taxa` com `(taxa - 0,4) + 0,4`: um lado derivado do outro, verdadeiro para qualquer
número. A linha tem `Math.abs`, tem tolerância e tem duas variáveis — ela **parece**
uma igualdade de verdade, e a varredura manual que eu tinha acabado de fazer por
`assert.ok(... > 0)` passou por ela sem ver. Onde a asserção é o coração do teste,
pergunte de onde veio o valor comparado; se ele veio do valor testado, não há teste.

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
