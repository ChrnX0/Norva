# Plano de desenvolvimento — NORVA

Da fábrica que usa papel hoje até o aplicativo publicado nas lojas.

**Por que este arquivo existe.** Em 3 de setembro uma sessão terminou o escopo
escrito e ficou sem lista — não por falta de trabalho, mas porque a lista morava
espalhada entre as fases do `CLAUDE.md`, as dívidas do `docs/insights.md` e a
cabeça de quem estava trabalhando. A regra de "nunca ocioso" diz que a próxima
coisa vem da **lista escrita**; sem uma, ela vira convite a inventar tarefa, que é
pior que parar.

E em 4 de setembro o dono leu a primeira versão dele e disse a coisa certa: *"nunca
vi roadmap pela metade"*. Estava mesmo — era uma lista de seis itens fechados com
um bilhete dizendo que a lista estava vazia. Lista vazia não é plano. Plano é o
arco inteiro, com o que já existe, o que falta, em que ordem, e o que trava cada
coisa.

---

## Onde o produto está hoje — medido, não afirmado

Os números abaixo saem de comando, não de memória. Cada um tem como conferir — e
`src/bar.test.ts` **roda essa coluna**: cada linha é derivada do sistema e comparada
com o que está escrito aqui, então a tabela não envelhece em silêncio.

*E isso passou a ser verdade em 7 de setembro. Até então a guarda cobria **dez das
treze** linhas, e a fronteira estava dita em voz alta no docblock dela — "acrescentar
uma linha sem acrescentar uma entrada aqui não quebra nada" — contra esta promessa,
quatro linhas acima, de que cobria todas. As três de fora eram a versão do aparelho, a
contagem de linhas e as guardas da proofgate; duas estavam erradas, uma por 59%. Agora
uma segunda checagem recusa linha de tabela sem derivação atrás.*

*Ela já envelheceu, no dia em que foi escrita: quatro linhas ficaram para trás antes
do fim da tarde. Comando escrito ao lado do número é convite, não garantia — ninguém
roda quinze comandos antes de acreditar numa tabela. Por isso a guarda.*

| | | como conferir |
|---|---|---|
| telas | **34** | `find app -name '*.tsx' \| grep -v _layout \| wc -l` |
| tabelas no aparelho (SQLite) | **26** | `grep -c 'CREATE TABLE IF NOT EXISTS' src/data/db.ts` |
| tabelas no servidor (Postgres) | **28** | `grep -h '^create table' supabase/migrations/*.sql \| wc -l` |
| migrações do servidor | **54** | `ls supabase/migrations \| wc -l` |
| migrações do aparelho | **V29** | último `const V` em `src/data/db.ts` |
| papéis | **7** | `src/domain/access.ts` |
| capacidades | **12** | `src/domain/access.ts` |
| linhas de código | **~89.000** | `find src app e2e scripts supabase -type f \( -name '*.ts*' -o -name '*.sql' -o -name '*.mjs' \) \| xargs wc -l` |

E a barra de verificação, que é o que separa "compila" de "funciona":

| | |
|---|---|
| `npm test` | **671** testes |
| `npm run mutate` | **125** defeitos plantados, 123 pegos, 2 equivalentes, **0 sobreviventes** |
| `npm run e2e:fast` | **53** checagens num navegador de verdade |
| `npm run db:verify` | **28** garantias contra um Postgres descartável, sob RLS |
| `.proofgate/verify.sh` | **25** guardas de entrega |

**Nível de evidência: E3** — exercitado contra Postgres e navegador de verdade, com
as 21 telas fotografadas nas **quatro caras de verdade** (Papel e Orgânico × claro e
escuro, 84 fotos, `npm run shot -- --tudo`). Até 5 de setembro toda foto chamada
`organico` era Papel, porque a ferramenta herdava a cara em vez de escolhê-la
(`docs/insights.md`, "padrão não é escolha"); ela passou a escolher sempre e a
**recusar duas fotos idênticas com nomes diferentes**, então a afirmação acima é
conferível. E **nada visto numa fábrica.** Essa é a lacuna que nenhum teste fecha, e ela decide o que pode ser
construído agora e o que precisa esperar (veja o portão P2, adiante).

### Os sete papéis, que são o desenho do produto e não detalhe

`owner` · `operator` · `storeManager` · `driver` · `buyer` · `customer` ·
`salesperson`

Um deles é a decisão do dono que mais restringe desenho futuro: **o aparelho
emprestado entra como `operator`** — produz, despacha, confere, registra perda e
conta a prateleira, e não vê preço, custo nem dinheiro em lugar nenhum.

---

## O arco inteiro

Sete etapas, e a ordem não é gosto: cada uma destrava a seguinte por um motivo
escrito na coluna da direita.

| | etapa | o que a fábrica ganha | o que ela precisa antes |
|---|---|---|---|
| **F1** | fundação — livro-razão, custo, estoque | o número de estoque para de ser chute | — |
| **F2** | produção, lote, validade, câmara | a corrida do tacho vira registro | F1 |
| **F3** | o papel sai do chão de fábrica | romaneio, conferência e etiqueta no celular | F2 |
| **F4** | a fábrica se explica sozinha | o Espelho da Loja e a compra na hora certa | **meses de movimento real** |
| **F5** | o fiscal | nota fiscal eletrônica | certificado A1 e homologação SEFAZ |
| **F6** | publicar nas lojas | qualquer fábrica instala | F3 + privacidade + licenças |
| **F7** | os trunfos | roteirização, clima aplicado, PAC/POD | F4 |

**F1 e F2 estão feitas.** F1 por decisão do dono em 1 de setembro (a auditoria
mediu 6 prontos, 9 parciais e 1 ausente, e ele decidiu com o número na mão). F2
fechou com o lote dizendo de que ficha saiu, a câmara dizendo o que estava dentro
na hora da leitura, e a lista de compras por simulação.

**O que domina o calendário não é código.** A F4 precisa de meses de movimento
real — nenhuma quantidade de trabalho encurta isso. A F5 é um microserviço .NET
com certificado e homologação, que é ato administrativo. Por isso o alvo de um mês
decidido pelo dono é **F2 + F3**, e o resto tem data de começo, não de entrega.

---

## A FILA DE AGORA — 9 de setembro, a auditoria de 24 fatias

**145 achados julgados, 127 de pé, 18 derrubados.** Vinte e quatro fatias
independentes — dez de lógica, oito de código, seis de design —, cada uma com um
adversário próprio tentando derrubar os achados dela antes de virarem afirmação. Os
números abaixo saem do diário da execução, não de contagem à mão.

**48 fechados na mesma sessão.** O que sobra está aqui, por peso. Cada item traz a
medida ao lado, como a regra deste arquivo exige: item aberto prova que a coisa NÃO
existe, e a suíte fica vermelha no dia em que alguém a construir sem riscar a linha.

### A. A caminhada de 9 de setembro — o que apareceu usando o aplicativo
<!-- medida: espera o dono usar o APK no tablet dele: o custo do ambiente é de emulador por software, e só o aparelho real diz se a margem existe lá -->

Feita com o aplicativo instalado, tela por tela, começando pelo Reset. **O que ela achou,
por peso, e o que já foi fechado:**

1. ~~A entrada congelada em seis componentes~~ — **fechada**, com a rede compartilhada e a
   varredura que a cobra (`src/components/chegada.ts`).
2. ~~A capa afirmando "nada saiu hoje" sem ter lido~~ — **fechada, e as outras 31 junto,
   em 10 de setembro.** O número era estimativa ("as outras 51") e virou medida: 32 telas
   chamavam `useQuery` e UMA destrinchava o `error`. Numa leitura que falha o desenho é
   igual ao de um estado vazio, e vazio aqui é uma AFIRMAÇÃO — "não saiu nada hoje", "não
   há saldo", "não há ficha". O `CollapsingHeader` passou a desenhar a falha e cada tela
   entrega o erro; `src/casco.test.ts` cobra a entrega, com a lista de dívida em zero e
   uma fronteira escrita de um nome só (o assistente, que fecha por omissão de propósito).
3. ~~Os dois números de Receitas que não fechavam~~ — **fechada**.
4. **O ambiente satura a thread de UI e o aplicativo passa a renderizar errado.** Provado
   ligando e desligando: com movimento, a capa esvazia, o Almoxarifado vem sem a lista, os
   cartões vêm pálidos, a rolagem morre e o `uiautomator` não lê a tela; com "reduzir
   movimento" ligado, tudo desenha, a rolagem funciona e a CPU cai de 190% para 41%. **A
   caminhada inteira teve de ser feita com o ambiente parado**, senão o aplicativo não se
   deixa dirigir. Isto é o item de baixo, e ele deixou de ser sobre bateria.
5. **`norva://settings` não navega com o aplicativo aberto** — e isto foi reconferido
   depois do conserto da renderização, com a capa desenhando perfeita e sendo a tela
   errada: o intent é entregue e ignorado. `inputs`, `recipes`, `extrato` e `purchase`
   navegam. Em partida fria todos funcionam. Importa para QR e notificação.
6. **Quem entra por link direto numa tela interna não tem volta**: o botão voltar sai do
   aplicativo, porque não há pilha atrás.
7. ~~**A primeira ação que a capa oferece num aplicativo vazio é impossível.**~~ —
   **fechada em 10 de setembro.** A tela de produção tem razão escrita para não navegar
   dali (é empilhada, e o caminho de volta é o de sempre); o defeito estava antes, na capa
   sugerindo a única coisa que ainda não dava para fazer. `primeiroPasso` no domínio
   devolve onde a cadeia parou — insumo, ficha, produto ou produção — e a capa oferece a
   porta que falta.
8. **Nomes cortados onde a escolha depende deles**: na configuração das peças da capa
   metade dos rótulos vem com reticências (*"Produção a…"*, *"Quem rece…"*, *"Vence
   prim…"*), então não dá para saber qual peça se está escondendo.
9. ~~**A palavra quebrada no meio**: o botão de idioma escreve *"Portugu / ês"*.~~ —
   **fechada.** Os três botões dividiam a largura em três fatias iguais e a 360 dp a fatia
   é menor que a palavra. A linha passa a quebrar e cada botão toma a largura da palavra
   dele — sem número mágico, e no tablet os três continuam na mesma linha.
10. **A última linha de uma lista fica sob a barra de abas** — em Mais, a linha *"Ajustes"*
    nasce cortada. **Medido contra o código em 10 de setembro, e o código contradiz o
    item:** tudo o que a tela desenha está dentro do `CollapsingHeader`
    (`app/(tabs)/more.tsx:197`), que já reserva `insets.bottom + space.xxl + tabBar`
    (`src/components/CollapsingHeader.tsx:314`) lendo a altura real da barra pelo
    `BottomTabBarHeightContext` — e a barra declara `58 + space.lg + insets.bottom`
    (`app/(tabs)/_layout.tsx:137`), que é a altura com a faixa do sistema somada, cicatriz
    já paga. Ou seja: a folga existe e é generosa. Então ou o corte é da ENTRADA (`Reveal
    index={3}` desloca o último cartão enquanto anima) ou o item viu a lista simplesmente
    mais alta que a tela, que é rolagem e não defeito. **Não se reconstrói o que já
    existe** — este fica esperando a foto para dizer qual dos dois é.
11. **`expo-updates` perguntava DUAS vezes por abertura** — metade fechada, metade é
    decisão do dono. O item dizia *"a cada ~70 s"*, e medir a afirmação contra o código
    corrigiu isso: não há temporizador. O `app.json` trazia `checkAutomatically: "ON_LOAD"`,
    que faz o nativo perguntar sozinho a cada abertura, e `rodadaAutomatica`
    (`app/_layout.tsx:76` e `:178`) pergunta de novo no boot e a cada volta ao primeiro
    plano — esta segunda por decisão escrita do dono, 8 de setembro. Os intervalos do log
    (08:40:14 → 08:41:07 → 08:47:02 → 08:48:07: 53 s, 355 s, 65 s) são irregulares porque
    são idas ao primeiro plano, não relógio.

    **Fechado:** a pergunta nativa saiu (`ON_ERROR_RECOVERY`), e o comportamento visível
    não muda — a nossa baixa e a próxima abertura aplica, que é o que o docblock de
    `buscarAtualizacao` já prometia. A diferença é que a falha daqui vira `Tentativa`, e a
    de lá virava rastro de pilha. Guarda em `src/release.test.ts`.

    **Aberto, e é do dono:** o canal `preview` não tem nada publicado, então a pergunta que
    sobrou continua falhando uma vez por abertura. Publicar ali — ou tirar a URL até haver
    o que publicar — é decisão dele, e o `EXPO_TOKEN` vazado está no meio dessa conta.
12. ~~**A mesma palavra conta coisas diferentes**: Ajustes diz *"Insumos 6"* e o Almoxarifado
    diz *"Insumos 4 · Embalagem 2"*.~~ — **fechado**, e a conta estava certa: `countForErase`
    soma `input`, `packaging` e `store_supply` porque é isso que a área apaga (migração
    `0049`). O defeito era de **palavra** — uma servindo a três conjuntos. Ajustes passa a
    chamar a área pelo nome da tela (*Almoxarifado*), a linha debaixo passa a nomear os três
    (*insumos, embalagem e material de loja*), a confirmação conta *"6 itens do
    almoxarifado"*, e a capa deixa de dizer *"Insumos em dia"* sobre uma conta que também
    olha embalagem (`runningOut` tem `['input','packaging']` de padrão, com razão escrita).
    A guarda que impede a volta é a porta: `src/dictionary.test.ts` cobra que a linha do
    Mais diga o nome da tela que ela abre, com fronteira escrita para as que diferem de
    propósito.
13. ~~**O editor da ficha técnica abre com o cabeçalho vazio.**~~ — **fechado**: era a
    entrada travada em opacidade zero, e a opacidade saiu da entrada inteira. Provado no
    aparelho com movimento LIGADO (`tinta 11,56:1 em 20/22 fitas`). O texto abaixo fica
    como estava porque a suspeita que ele registra foi a que acertou.

    **O editor da ficha técnica abre com o cabeçalho vazio.** `app/recipes/[id].tsx` deixa
    uma faixa de ~170 dp de papel puro no topo — sem sobrancelha, sem título, sem cena —,
    e ela não é transição: sobrevive a rolagem para baixo e para cima. O `CollapsingHeader`
    recebe `title`, `overline` e `cena="receitas"`, então não é falta de dado. Papel puro
    também é o que opacidade zero produz, então a suspeita é a entrada travada em 0 — o
    caso extremo do defeito que a rede conserta, e que aqui não foi coberto.
14. **`Criar {{name}}?`** ~~o marcador do dicionário na confirmação da ficha~~ — **fechado**,
    com a varredura que o pega (`marcadoresSoltos`).
15. **O `accessibilityLabel` do Extrato lia a frase crua** ~~"Ver mais — {{n}} até aqui"~~ —
    **fechado** pela mesma varredura, e ele é o tipo de defeito que só existe na metade da
    tela que ninguém olha.

### A.2 — 10 de setembro: a segunda caminhada, ficha e produto
<!-- medida: presente app/recipes/[id].tsx :: beforeRemove -->

Feita com o aparelho dirigido pela árvore de acessibilidade (o `uiautomator` volta a ler
com o ambiente parado), e cada achado conferido contra o SQLite do aplicativo antes de
virar afirmação. **Seis fechados no mesmo dia:**

16. ~~**A unidade da ficha morre na primeira edição.**~~ — **fechada**. O cadastro oferece
    mililitro, grama e unidade, e gravava certo; `app/recipes/[id].tsx` salvava
    `yieldUnit: 'ml'` literal. Provado no banco do aparelho: `Massa de pao` versão 1 em
    `g`, versão 2 em `ml`, mesmo número. Achado pelo dono.
17. ~~**"▲ R$ 0,02 por unidade contra a versão 1 (0,0%)"**~~ — **fechada**. `compareVersions`
    devolvia `0` quando a versão anterior não tinha custo. Zero é um fato — "não mudou" —, e
    usá-lo para dizer "não sei" põe as duas afirmações na mesma frase.
18. ~~**"Caixa fechada: R$ 3,50" numa caixa de R$ 3,66.**~~ — **fechada**. O custo da
    unidade é `Cents` inteiro; multiplicar por cinquenta arredonda duas vezes e come 4,5%
    do número que dá preço de caixa. `costPerPack` multiplica antes e arredonda uma vez.
19. ~~**"Vai em cada unidade" pede para ser preenchido e não guarda nada.**~~ — **fechada**
    pela verdade e não pela gravação: a porção mora no PRODUTO, e uma ficha pode alimentar
    dois produtos de tamanhos diferentes. O campo continua sendo a simulação que a tela
    precisa, e agora se apresenta como tal.
20. ~~**"Criar ficha" não responde ao toque.**~~ — **fechada**. O rendimento nascia vazio: o
    40000 era placeholder, e o docblock da tela já prometia o contrário. Botão desligado que
    não diz o que falta é a Lei 5 ao contrário.
21. ~~**"por litro de massa" para uma ficha pesada em grama.**~~ — **fechada**. A figura é o
    custo de MIL unidades-base: um litro em ml, um quilo em g, mil unidades em un.

24. ~~**O campo do nome do produto perde letras enquanto se digita.**~~ — **fechada** no
    `Field`, que é de 55 campos. `TextInput` controlado no Android repõe o texto nativo
    quando o `value` que volta do JS difere da caixa, e o nome do produto vem de um valor
    DERIVADO (`composed`), que volta atrasado. Medido com contraste: as mesmas 17 letras,
    a mesma chamada — o nome da FICHA ficou inteiro, o do PRODUTO ficou "Picole de moran",
    depois "Picole de mor", depois "Picole ". Comprimento diferente a cada vez é corrida.

25. ~~**O campo perde a dica para o editor em tela cheia do teclado.**~~ — **fechada** com
    `disableFullscreenUI`. Deitado — e o dono tem tablet — o Android troca a tela inteira
    por uma caixa de texto no topo com branco embaixo, apagando a dica que devolve a conta
    a cada tecla, que é a metade pela qual o `Field` existe.

26. **O emulador deixou de instalar o APK, e não é defeito do aplicativo.** A partir das
    13h30 de 10 de setembro toda instalação falha com `Failure calling service package:
    Broken pipe (32)` ou `Can't find service: package`, e o serviço `package` cai junto —
    ele responde antes da tentativa e não responde depois. **Oito hipóteses derrubadas,
    cada uma por medida e não por opinião:**

    | hipótese | como caiu |
    |---|---|
    | instantâneo degradado | boot com `-no-snapshot-load` falha igual |
    | memória do aparelho | 3072 → 4096 MB, falha igual |
    | disco do hospedeiro | `dd` de 300 MB dentro do aparelho escreve liso; 7,9 GB livres |
    | APK corrompido | `unzip -t` sem erro, 119 entradas de assinatura |
    | `adbd` em modo root | falha nos dois modos |
    | AVD corrompido | AVD **novo**, criado do zero, falha igual |
    | servidor do `adb` | `kill-server`/`start-server`, falha igual |
    | `dex2oat` do install | `pm.dexopt.install=skip`, falha igual |

    O que o log entrega: `StartPackageManagerService took to complete: 80126ms`. Ele não
    quebrou — ficou glacial, e todo caminho de instalação estoura antes.

    ### FECHADO às 16h20 do mesmo dia, e duas linhas da tabela acima estavam erradas

    **A imagem `aosp_atd` instala de primeira** (`Success`), e ela era a alavanca que o
    plano de 6 de setembro já tinha nomeado — *"feitas para CI headless, sem launcher, sem
    papel de parede, sem apps de sistema"* — e que nunca foi instalada. O AVD `norva-atd`
    sobe inteiro em ~7 min contra ~12 da `default`, e o `UpdatePackagesIfNeeded` deixa de
    mastigar 82 s. O aplicativo instala, abre e **desenha**: a árvore de acessibilidade traz
    a capa do primeiro dia inteira.

    **As duas linhas erradas, e as duas erraram do mesmo jeito — medindo outra coisa:**

    - *"disco do hospedeiro | `dd` de 300 MB dentro do aparelho escreve liso; 7,9 GB
      livres"*. O `dd` responde se o convidado grava; não responde o que o **emulador
      pede**, que é 7,37 GB para criar a partição de dados do zero. Liberando 3,5 GB de
      cache derivado do Gradle, o erro **mudou** — de `Broken pipe` para o rastro inteiro
      de um `NullPointerException`, que foi o que finalmente nomeou a causa.
    - *"AVD corrompido | AVD novo, criado do zero, falha igual"*. Duas das três tentativas
      com o `norva-limpo` morreram em `FATAL | Not enough space to create userdata
      partition. Available: 6551.58 MB … need 7372.80 MB` — ou seja, **o AVD novo não
      chegou a bootar**. A linha foi escrita sobre uma partida que não aconteceu.

    **A causa, agora nomeada, e são DUAS em série:**

    1. Instalar antes de `sys.boot_completed` dá
       `NullPointerException: … PackageManagerInternal.freeStorage(…) on a null object` em
       `StorageManagerService.allocateBytes`. O `StorageManagerService` só pega o
       `PackageManagerInternal` na fase BOOT_COMPLETED, e ela chega **doze minutos** depois
       de `service check package` e `service check window` responderem `found`. O
       `scripts/aparelho.mjs` parava nos dois serviços — por causa da cicatriz certa de que
       `sys.boot_completed` mente depois de instantâneo — e por isso instalava cedo demais.
       Hoje ele exige as **três** coisas, e num instantâneo restaurado as três são
       verdadeiras juntas, então a cicatriz velha continua paga.
    2. Com o aparelho realmente pronto, a instalação passa do NPE e o **Watchdog mata o
       `system_server`**: `watchdog: Blocked in handler on foreground thread (android.fg)`
       às 15:49:44, `DeadSystemException: The system died` às 15:50:39 — os 60 s do
       temporizador. É isso que chegava ao terminal como `Broken pipe (32)` e como `Can't
       find service: package`. Numa `default` sem KVM, escrever 29 MB na sessão de
       instalação não cabe na janela do Watchdog; numa ATD, cabe.

    **Mais três medidas que não resolveram**, para ninguém repetir: partida fria com
    `-wipe-data` (falha igual), `pm.dexopt.install=skip` num aparelho **realmente** bootado
    (falha igual — a medida antiga foi feita num que nunca terminou de subir), e
    `verifier_verify_adb_installs=0` (falha igual).

    **E duas coisas que a ATD trouxe de brinde, as duas defeito de ferramenta:**

    - **`-prop persist.sys.locale=pt-BR` é RECUSADO pelo emulador** (`unexpected '-prop'
      value … only 'qemu.*' properties are supported`), e o docblock do `subir` prometia
      que essa bandeira decide o idioma da foto. A capa saiu em inglês — *"Today the
      factory has not produced yet"* —, que é exatamente a mentira que a bandeira existia
      para impedir. O caminho que funciona é `adb shell setprop persist.sys.locale pt-BR`
      como root, com o arcabouço reiniciado depois.
    - **`screencap` do convidado devolve quadro preto** na ATD com
      `-gpu swiftshader_indirect`, e o atalho pelo console do emulador devolve o quadro
      **velho** (a splash), com o mesmo tamanho e a mesma variação em três fotos seguidas
      enquanto a árvore de acessibilidade já mostrava a capa desenhada. Foto que repete
      byte a byte não é foto: é a prova de que a captura está congelada, e sem a árvore ao
      lado ela teria passado por "o app não abriu".

      **E o recorte do que ela congela tem nome, medido às 16h37:** a captura mostra a
      SPLASH — que é fundo de janela do próprio Android — e nunca a capa, que é superfície
      acelerada do React Native. Com `-gpu guest` o `screencap` do convidado sai preto
      (15.197 bytes, cor única) e o `screenrecord` grava 3 KB de nada, enquanto o
      `uiautomator` lê a capa inteira em português no mesmo instante. Ou seja: sem janela de
      hospedeiro, a superfície do RN não entra no quadro capturado — janela comum entra.
      Então **a caminhada continua pela árvore de acessibilidade**, que é como a de 10 de
      setembro já foi feita, e a foto de pixel fica devendo até isto ter saída.

27. **A porta "Lojas e clientes" abre a tela "Estoque por lugar"** — o mesmo defeito do item
    12 numa segunda palavra, e foi a guarda nova dele que o achou. A tabela guarda cinco
    espécies — `own_store`, `customer`, `vehicle`, `cold_room` e a própria fábrica
    (`app/places.tsx:110`) —, o menu promete duas delas (`src/i18n/locales/pt-BR.ts:766`), o
    cabeçalho da tela diz uma terceira coisa (`src/i18n/locales/pt-BR.ts:1324`) e a
    confirmação de apagar conta *"lugares"* (`t.app.settings.counted.places`). Qual nome
    vence é decisão de produto e não troca de rótulo: a mesma tela cadastra o lugar e mostra
    o saldo dele. Fronteira escrita em `PORTA_DIFERENTE_DA_TELA`
    (`src/dictionary.test.ts`), que é o que impede o achado de sumir.

28. **A conferência da doca só sabe dizer "chegou tudo"** — e isso contraria uma decisão
    escrita do dono. Achado dirigindo o aplicativo em 10 de setembro: o toque em *"Loja
    Centro ainda não conferiu o que chegou"* abre uma folha com UM botão, *"Conferir
    chegada"*, e grava. Não há onde dizer que faltaram três caixas.

    O `CLAUDE.md` decide o contrário, com estas palavras: *"contagem é perguntada toda
    vez, e é gravada como diferença que o livro-razão guarda, nunca como valor que
    sobrescreve"*. E a seção de tom usa como exemplo canônico de como o aplicativo fala
    uma frase que ele **não consegue produzir**: *"Faltaram 3 caixas na conferência"*.

    O que existe e o que falta, medido:
    - `recordCheck` (`src/data/repository.ts:3981`) **aceita** `counted?: {itemId,
      baseUnits}[]` — o caminho de escrita está construído e provado.
    - `app/(tabs)/transport.tsx:137` chama `recordCheck(empresaDaqui(), { groupId })`,
      sem `counted`, sempre. O comentário acima justifica a omissão com um problema real
      mas ESTREITO (somar o destino contaria duas cargas do mesmo dia duas vezes) — e a
      consequência é muito maior que a razão: a diferença nunca entra no razão.
    - `t.signals.missing` — *"Faltaram {{count}} caixas"*, nos três idiomas — **não tem
      leitor nenhum** (`src/i18n/locales/pt-BR.ts:1976`).

    Consequência de negócio: o Espelho da Loja mede o que cada loja devolve, e a captura
    dele depende desta diferença. Sem ela, a falta some entre a fábrica e a prateleira.

29. **A guarda de chaves do dicionário casa pelo NOME da folha, em qualquer objeto** — e
    foi ela que escondeu o item 28. `folhasSemLeitor` (`src/dictionary.test.ts:464`)
    pergunta se `\.<folha>\b` aparece em algum lugar do código. Para `signals.missing`
    isso casa com `d.missing` e `e.missing`, que são propriedades de objetos de domínio
    sem relação nenhuma com dicionário — então a chave passa por lida.

    Provado nos dois sentidos: `signals.checked` aparece no código como
    `t.signals.checked` (`app/(tabs)/transport.tsx:240`) e é lida de verdade;
    `signals.missing` não aparece com o pai em lugar nenhum.

    **Pelo menos cinco chaves mortas passam hoje**, cada uma conferida na mão:
    `signals.missing`, `common.why`, `common.confirm`, `common.ask` e `app.home.running`
    — as três de `common` porque `.why`, `.confirm` e `.ask` existem sob OUTROS pais
    (`t.app.recipe.why`, `t.app.assistant.why`, `t.app.lotLabel.why`).

    **E o número maior ainda não existe, de propósito.** Uma régua estrita que exige o pai
    antes da folha acusou 610 de 1.386 — e ela está errada, porque não modela nem o objeto
    de plural (`plural(n, t.app.home.orderCount)` nunca escreve `.one`) nem a leitura por
    índice, que a guarda atual já trata. Dizer 610 seria repetir a cicatriz do detector que
    não passa no caso falso. O conserto é a régua saber a forma da leitura; o número sai
    depois dela, não antes.

    E o docblock do arquivo promete que este buraco foi fechado em 9 de setembro (*"as 44
    viraram 39 de verdade"*) — fechou o buraco do índice dinâmico, não o da colisão de
    nome. Fronteira dita em voz alta continua sendo fronteira: ou fecha, ou a promessa se
    corrige.

**Aberto do que esta caminhada achou:**

22. ~~**Sair do editor com alteração pendente não avisa.**~~ — **fechada** com uma guarda em
    `beforeRemove`: sair passa a perguntar, dizendo o que fica e o que se perde. O rascunho
    aqui é uma ficha inteira, com o custo já recalculado à vista — e foi este defeito que me
    fez registrar uma linha como "não gravada" quando ela só não tinha sido salva.
23. ~~**A confirmação da versão termina em vírgula quando não há porção.**~~ — **fechada**
    com `saveBodyPlain`: sem porção não há custo por unidade e não há o que resumir.
    Confirmação truncada ensina a não ler confirmação, que é a Lei 5 perdendo o que ela
    existe para comprar.

**O que a segunda caminhada CONFIRMOU funcionando:** as três réguas de rendimento no
cadastro da ficha; a confirmação da ficha com os números por extenso e a régua escolhida
(*"vai render 12.000 g de cada vez"*); a aritmética do custo em toda tela conferida na mão
(1.000 g × 1,24 ¢/g = R$ 12,40; 40.000 ml ÷ 70 = 571 unidades; 1.240 ¢ ÷ 571 = R$ 0,02;
50 × 6 = 300 unidades por engradado); e a tela de produto, que é a mais bem resolvida do
aplicativo — nenhum campo nasce vazio e cada número traz a conta ao lado.

**O que a caminhada CONFIRMOU funcionando**, para o relatório não ser só defeito: o Reset
com as duas confirmações, exatamente como a decisão pede — a primeira com os números por
extenso (*"6 insumos, 6 movimentos do livro-razão, 2 receitas, 1 produto e 6 compras"*), a
segunda explicando o que o registro é (*"Apagar não desfaz os lançamentos: tira-os do
mundo"*); o prazo de 10 dias no lugar; as áreas que não podem ser apagadas cinzas **com o
motivo escrito**; e o estado voltando para *"Vazio, sem exemplo"* depois do apagamento.

### A. Nada mede o que o movimento de ambiente custa — e ele já comeu uma tela
<!-- medida: ausente src/components :: orcamento de movimento -->

Medido no emulador em 9 de setembro, com o aplicativo **parado** numa tela: **190% de
CPU**, 130 mil objetos alocados a cada 39 segundos, e a tela real desenhando a 1,7
quadro por segundo. A thread de JavaScript estava a **0,4%** — não é laço de
renderização: é a thread de UI, onde as trinta e oito chamadas de `useCiclo` desenham
atributos de SVG (`useAnimatedProps`, 52 usos) quadro a quadro, para sempre, em toda
tela. Ligar "reduzir movimento" no aparelho derrubou o número para **22,6%**.

E não foi só custo: a mola de entrada do `Reveal` corre nessa mesma thread e **nunca
chegava**. A capa do primeiro dia ficou a 22% de opacidade — 1,56:1 de contraste num
piso de 4,5:1 — por minutos, atravessando rolagem e navegação. Isso está consertado
(`src/components/Reveal.tsx`, a rede embaixo da entrada), mas o conserto protege o
conteúdo, não a bateria.

A doutrina do movimento em `src/theme/tokens.ts` fala de **duração de ciclo** (4 a 12 s)
e não fala de **quantos ciclos correm juntos** nem do que custam. Falta um orçamento: um
teto de ciclos vivos por tela, ou parar o ambiente do que está fora da vista.

**Duas das três medidas entraram em 10 de setembro, e o resultado partiu em dois.** Um
relógio só no lugar de trinta e oito animações infinitas, e o compasso parando quando a
tela sai de vista. **O defeito de TELA acabou** — com o movimento ligado a capa passou a
desenhar inteira (15,35:1 em 20 de 22 fitas, onde antes esvaziava até a linha de olho), a
rolagem voltou e os quadros por segundo subiram de 1,7 para 4,2. **O CUSTO não**: a CPU
com a tela parada caiu de ~190% para ~150%, e o que sobra são as escritas de propriedade
de SVG quadro a quadro — um relógio ou trinta e oito, o número de nós que escrevem props
é o mesmo.

A terceira medida é a que resolve isso e é **decisão do dono**, porque muda o que se vê:
hoje o ícone de cada linha de lista se mexe, e a proposta é manter o movimento onde ele é
olhado (a cena do cabeçalho, a capa, os sinais que significam alguma coisa) e deixar o
ícone dentro da linha parado. **Ela não se decide neste emulador**, que não tem GPU e
rasteriza cada mudança de prop na CPU: quem responde se 150% é problema é o tablet.

**E o custo não é só bateria: a árvore de acessibilidade fica ilegível.** Medido logo
depois, e este não é número de emulador lento — é uma propriedade de animação infinita.
Com o movimento no estado normal, `uiautomator dump` falhou três vezes em três, e a
terceira disse a causa com todas as letras: **`ERROR: could not get idle state`**. A
janela nunca fica ociosa. Com "reduzir movimento" ligado, o mesmo comando devolveu 128
nós e 18 textos em 15 segundos.

Duas consequências dentro do repositório, e a segunda é pior:

1. `oQueDizATela()` (`scripts/aparelho.mjs`) devolve lista vazia em operação normal, e
   o `try/catch` engole a falha em silêncio.
2. Por causa disso, `mesmaTelaEmTodas` — a guarda que o `CLAUDE.md` descreve como o que
   pega "a navegação não pegou numa das cinco larguras" — compara listas vazias e
   **nunca pode falhar**. Uma guarda que não distingue os dois casos, exatamente o que
   este projeto proíbe.

E a pergunta que fica de pé, porque um leitor de tela usa esse mesmo cano: se o
`uiautomator` não consegue ler a tela, o TalkBack consegue? Não meço isso daqui — o
aparelho do dono responde.

**A fronteira, para o item não afirmar mais do que mediu:** os 190% são de um emulador
por software, sem GPU e sem KVM. Não afirmo o número no tablet do dono — afirmo que a
thread de UI é o recurso disputado e que hoje ninguém a mede. O `could not get idle
state`, esse, não depende da máquina.

### A. O aplicativo não lê o estado do pedido de Reset
<!-- medida: ausente src/sync :: from('erase_requests') -->

O aparelho ESCREVE o pedido pela fila (`src/sync/serialize.ts:597`) e nunca o lê de
volta. Ninguém na tela sabe que existe um Reset pendente, quando ele vence, se já
aconteceu, ou se falhou — e desde a `0049` a falha tem motivo gravado (`last_error`) sem
ninguém para mostrá-lo. É a única parte do ato que ficou de costas para quem o pediu.

Achado ao consertar a `0045`: o executor passou a engolir a exceção de propósito, para um
pedido não travar os outros, e quem engole exceção precisa de alguém lendo o rastro. Hoje
o rastro só existe para quem abre o banco.

Depende de um caminho de LEITURA do servidor, que ainda não existe — a sincronia é fila
de subida. Então isto entra atrás dele, não na frente.

### A. Os médios e baixos que sobraram
<!-- medida: presente src/theme/tokens.ts :: export const ALVO = 48 -->

~~Alvos de toque de 28–30 dp~~ **fechado em 9 de setembro**: o piso virou constante
(`ALVO`), mora no `Touchable` — que é quem carrega as etiquetas tocáveis, e o `Chip` é
desenho — e sete controles miúdos passaram a declará-lo. A guarda
`a small control declares the touch floor` recusa preenchimento miúdo sem piso.

~~O espanhol com três segundas pessoas~~ **fechado em 9 de setembro, e o número estava
errado: eram duas.** `vos` e `vosotros` não aparecem em lugar nenhum. `tú` e `usted`
apareciam, e numa frase só — a confirmação de cadastro de insumo começava em `tú` e
terminava em `usted`. Unificado em `tú`, que é o par do "você" e do "you" das outras duas
telas do mesmo dicionário, com a guarda `the Spanish speaks to one person, in one way`.

~~A ordem alfabética das palavras INGLESAS na lista de Lugares~~ **fechada em 9 de
setembro**: `ORDER BY kind` ordenava pela palavra do esquema, e em português a lista saía
*Câmara fria, Cliente, Fábrica, Loja própria, Almoxarifado, Veículo* — com o almoxarifado
da própria fábrica depois dos clientes. A ordem passou a ser de significado
(`ORDEM_DOS_LUGARES`), e a guarda a compara com o enum `location_kind` do Postgres.

~~39 chaves de dicionário sem leitor~~ **fechadas em 9 de setembro, e a doença ganhou
guarda.** É a única das quatro que crescia sozinha, e o `CLAUDE.md` a nomeia ao explicar
por que o portão é por item: *"quatro seções de dicionário nos três idiomas sem uma
tela"*. O teste que existia media **seção**, e admitia isso num docblock — `app.home`,
`weather` e `app.productForm` têm leitor, e tinham 22 folhas mortas dentro.

Trinta e cinco eram sobra e saíram nos três idiomas: dezesseis da capa que emagreceu de
quinze peças para sete, três frases longas de clima guardadas *"para a peça aberta"* que é
o seletor de cidade, um trio de lote que `app/lots/[id].tsx` já diz com outras chaves, e
oito frases cujo silêncio é decisão escrita no próprio arquivo que as deixou de dizer (o
transporte confere sempre com *"chegou tudo"*; o cartão de *"ninguém pediu para entrar"* é
cartão que ensina a ignorar cartão).

**Duas eram tela calada, e a segunda é a que importa.** `app.catalog.typeFromAnotherLine`
chegava como `String(e)` — inglês de programador. E `app.lotLabel.scanUnknown` não era dita
por ninguém porque a etiqueta responde *"esse lote não está mais aqui"* a quem apontou a
câmera para um quadrado de refrigerante: o aplicativo afirmando um passado que não houve. O
que separa os dois fatos não é o formato do código — `lotCode` diz por escrito que
`AAAAMMDD-NN` é o padrão e não a única forma — é o **caminho**, e agora a câmera e o campo
de digitar passam `lido`.

A guarda nova mede chave e sabe de índice dinâmico, que era a causa do falso positivo:
`words[recusa]` lê três chaves sem escrever o nome de nenhuma. Ela erra de propósito para o
lado seguro — deixa chave morta passar, nunca acusa chave viva.
<!-- medida: presente src/dictionary.test.ts :: every dictionary KEY has a reader -->

~~`PickLine.available` sem leitor de produção~~ **fechado em 9 de setembro, e o campo
morto era anestesia, não peso.** Ele é a mesma soma de `stockByPlace` para o mesmo
`location_id`, vinda pelo eixo do PEDIDO — e é o único número que alcança o caso que a
tela de carga não tinha como dizer: `stockByPlace` não devolve linha de saldo zero
(decisão certa, escrita lá), então o item que a loja pediu e a câmara não tem
**desaparecia por completo** — não estava na lista, não tinha linha, e nenhuma frase
falava dele. Quem carrega o caminhão descobria na loja.

E ao ligar o leitor apareceu o defeito que o silêncio dele escondia: a chave da
`useQuery` da separação era só o destino, e `available` é o único campo dela que é por
SALA. Trocar a sala de origem — que é estado da tela e um toque — mostraria o saldo da
sala anterior com o nome da nova. **O campo sem leitor não é só peso: ele anestesia o
recorte que depende dele.** A guarda nova lê a CHAVE e não o recorte inteiro, porque a
primeira versão dela passava verde casando o `from` de dentro da própria chamada — o
mesmo defeito do piso de toque, e por isso a prova é rodar contra o código anterior.
<!-- medida: presente src/layers.test.ts :: the picking query is keyed by the room -->

~~A régua fina do Papel que não separa nada~~ **medida e consertada em 9 de setembro** —
e o número apontava para a outra pele: `papelClaro.line` dá 1,63:1, e a do Orgânico dava
**1,06:1**, que é a mesma cor do papel. Ver `src/theme/contrast.test.ts`.

~~O remate em onda do Orgânico~~ **fechado em 9 de setembro, e o defeito era mais fundo
do que "a onda".** As duas colinas eram a MESMA curva duas vezes — mesma amplitude, mesmo
ritmo, cristas no mesmo x, uma onze unidades abaixo da outra. O que se via não era
profundidade: era uma faixa grossa com uma listra. É a regra que o dono deu para a fileira
de quatro lojas idênticas, acontecendo na silhueta em vez de nos objetos — onde ela é bem
mais difícil de ver, porque cada curva sozinha está bonita.

O conserto é o que a distância faz: ela achata o relevo. A de longe virou quase uma
varredura; a de perto ganhou crista própria, num x que não é o de nada atrás dela. A onda
fica, porque ela é a assinatura da pele — a versão que endireitava a de longe matava a
identidade junto com o defeito.

E foi julgado com o **pátio no meio**, não com as duas curvas sozinhas: os silos e o galpão
moram entre as camadas, e a candidata que parecia melhor no vazio enterrava o galpão até o
telhado.
<!-- medida: presente src/components/cenas/Paisagem.tsx :: A MESMA ONDA DUAS VEZES -->

O pacote da auditoria fechou.

### ~~Uma peça com cor: existe régua, falta decidir se existe lei~~ — DECIDIDO em 9 de setembro
<!-- medida: presente CLAUDE.md :: repetição regular lê como padrão de -->

**Decisão do dono: fica conserto de repetição, não vira lei de toda cena.** Nada muda no
código, e a contagem sai da fila — ela não é pendência.

**E o que decidiu foi a FOTO, não a contagem.** As seis cenas foram fotografadas no
aparelho e três dos números do meu contador estavam errados sobre o mundo: `Cópia` e
`Assistente` têm uma peça colorida só (o que ele contava como duas era um objeto e o
companheiro animado dele), e `Produção` é a regra do dono FUNCIONANDO — três picolés
iguais num trilho, um vermelho. Sobram `Transporte`, `Perdas` e `Compras`, e nas três as
duas coisas coloridas são objetos distintos, não uma fileira.

Fica a régua de leitura: **a contagem mede blocos de desenho, o olho mede coisas**, e onde
as duas discordam quem manda é o olho. Uma guarda em cima do número acusaria justamente a
gota que cai do picolé — que é o mesmo picolé.


O `CLAUDE.md` registra o conserto que o dono deu para a fileira de quatro lojas idênticas:
*"tamanhos diferentes, vãos desiguais, e uma só peça com cor — cor alternando em todo
elemento é cor que não quer dizer nada"*. Não há guarda para a terceira parte.

A contagem existe agora e está certa (validada contra `Produtos`, cujo docblock afirma
"uma só com cor", e contra `Receitas`, recém-desenhada). A unidade é a **peça de primeiro
nível**, achada por indentação — duas tentativas de parsear o JSX deram números errados
antes disso, uma delas contando atributo repetido dentro do mesmo grupo. Ela acha o que o
olho não acha lendo: peça com acento **dentro de um grupo de tinta** (`Producao` e
`Perdas` têm uma cada, escondida assim).

Medido hoje, peças com cor por cena: `Perdas` 3 · `Producao`, `Transporte`, `Compras`,
`Copia`, `Assistente`, `Espelho` 2 · o resto 1 ou 0.

**O que trava é o escopo da regra, não a régua.** "Uma só peça com cor" está escrito como
o conserto de um defeito específico — repetição regular lendo como papel de parede —, e
não como lei de toda cena. Uma cena com três objetos diferentes onde dois têm cor pode
estar certa. Virar guarda sem decidir isso é generalizar uma decisão do dono para além do
que ela diz, que é o erro simétrico ao de tratar decisão escrita como defeito. Decisão de
dono: a regra vale para toda cena, ou só onde há repetição?

### B. Duas pessoas conferindo a mesma remessa ainda dobram o saldo NO SERVIDOR
<!-- medida: ausente supabase/migrations :: discrepancy_once_per_group -->

O aparelho passou a recusar a segunda conferência (`JaConferidaError`, 9 de setembro), e
o servidor não tem a regra. Dois celulares na mesma doca, os dois offline, conferem a
mesma carga: os dois aceitam, os dois sobem, e a correção é aplicada duas vezes.

**Não é um índice único.** `(company_id, movement_group_id, item_id)` para `discrepancy`
bloquearia junto o caminho legítimo de correção — desfazer a conferência e conferir de
novo —, e um conserto que fecha a porta certa é pior que o defeito. A forma precisa
distinguir "a segunda" de "a segunda depois de a primeira ser estornada", e isso é
`reverses_movement_id`, que não cabe num índice.

É P3, e o alcance é o razão: entra com a forma na mesa antes de rodar.

**A forma está na mesa — 9 de setembro.** `supabase/migrations/0051` existe, é gatilho e
não índice, e a garantia 28 do `db:verify` a exercita nas quatro metades (a primeira entra,
a perna irmã do mesmo ato entra, a segunda do mesmo par morre, e depois do estorno passa).
Sem a migração a garantia fica vermelha dizendo *"a segunda conferência do mesmo item
passou: o saldo dobra"*.

**E ela não pode ser aplicada sozinha, o que só apareceu ao medir o outro lado.** A fila do
aparelho não sabe o que fazer com uma recusa permanente: `pushOnce` não marca a linha, tenta
de novo, e tudo o que vier atrás fica preso — o defeito que a `0048` chama de o mais caro
deste projeto. Aqui ele tem cara nova, e é o que trava o item: a recusa da `0048` era
ERRADA e o conserto era deixar a linha passar; **esta recusa é CERTA**, e "tentar de novo
para sempre" é a resposta errada para uma resposta certa.

Falta um caminho que a fila não tem: reconhecer *"esta linha não entra nunca, e está tudo
bem"*, tirá-la da frente, e contar isso a quem conferiu.
<!-- medida: espera decisão do dono: o segundo celular tem no razão dele uma conferência que o servidor recusou -->

**A pergunta é de dono e não de engenharia:** o segundo celular tem uma conferência no razão
dele que o servidor recusou. Ela se desfaz sozinha? Fica marcada como não aplicada? Quem
conferiu fica sabendo na hora, ou na próxima vez que abre a tela? Os três existem e mudam o
que a pessoa vê na doca.


### ~~Esperando decisão do dono~~ — as três DECIDIDAS em 9 de setembro
<!-- medida: presente src/domain/briefing.ts :: subiu para o padrão em 9 de setembro -->

O dono mandou fazer as três recomendações. O que saiu de cada uma:

- **~~`yield` na versão da ficha~~** — feito, e **medir mudou a forma do item**. Eram
  DOIS rendimentos fora da versão, não um: `recipes.yield_amount` (quanto uma batelada
  rende de massa, sobrescrita por `on conflict do update` a cada salvamento) e
  `products.yield_per_unit` (quantas unidades saem dela). As linhas da ficha já eram
  versionadas, o lote já carimbava a versão e o custo já congelava no movimento — os
  rendimentos escapavam das três. `0052` no servidor, `V28` no aparelho, gravados a cada
  versão, e a guarda prova o que importa: a versão 1 continua dizendo 10 depois de a 2
  dizer 12. **Entrou sem leitor**, e é o único caso em que a janela do P3 ganha do P1: o
  rendimento de uma versão passada, depois que alguém produzir, não está em lugar nenhum
  para ser reconstruído. Quem vai ler é a tela de histórico da ficha, que não existe — e
  isso está escrito nos dois arquivos de migração.
- **~~`sale` só para item vendível~~** — feito. `seVende` no domínio, ao lado de
  `vendeAoConsumidor`, porque são duas perguntas e as duas mudam no dia em que o ponto de
  venda chegar. A guarda mede as duas metades na MESMA contagem, na mesma loja: o picolé
  vira `sale`, o copinho vira `adjustment`, e o saldo desce igual nos dois — a espécie
  muda o nome do fato, nunca a aritmética.
- **~~A capa com nove peças~~** — feito. `pedidos` saiu do `DEFAULT_OFF`. O critério
  escrito é *"o padrão leva o que avisa e o que decide"*, e "Produza para os pedidos" é o
  aplicativo dizendo o que fazer amanhã. São nove, e o número redondo perdeu para a Lei
  outra vez — como quando os "~5" que eu propus viraram oito.

---

## Agora — o que está aberto

**Nada dos quatro. Os quatro foram fechados em `1fcbadc`**, e a lista de trabalho
está aberta esperando a auditoria.

> **E este arquivo quebrou a própria regra 1 por um commit.** Ela diz: *item
> fechado sai daqui no mesmo commit que o fecha*. Os quatro foram consertados num
> commit e riscados no seguinte. Fica registrado em vez de apagado — a regra existe
> porque plano que lista o que já existe manda alguém construir duas vezes, e a
> primeira pessoa a esbarrar nisso fui eu, uma hora depois de escrever a regra.

Vieram de uma varredura de sete eixos com refutação adversarial: **19 achados
julgados, 4 de pé, 15 derrubados.** A refutação foi dura de propósito — item errado
manda a próxima sessão construir o que já existe.

### 1. ~~A fila travava para sempre atrás de um pedido reenviado~~ — crítica, fechada

`supabase/migrations/0027_a_resend_is_not_a_decision.sql`

Terceira aparição da mesma família, e a primeira com cara nova. A 0015 consertou
`purchases`/`purchase_lines`, a 0020 consertou `lots`, e nas duas o defeito era
tabela com política de insert e **nenhuma** de update. Aqui `orders` **tem**
política de update — com a capacidade errada. Entra com `place_order`; só mexe quem
tem `approve_order`, `dispatch` ou `manage_company`. Três dos sete papéis
(`storeManager`, `customer`, `salesperson`) têm o primeiro e nenhum dos três.

Na fábrica: a gerente da loja anota o pedido sem sinal. A primeira subida entra. A
segunda é recusada, e o engine para a fila no primeiro buraco de propósito — então
produção, contagem e leitura de câmara gravadas **depois** ficam presas atrás
daquele pedido para sempre, sem nada na tela dizendo o quê.

**O que ele deixou atrás de si vale mais que ele.** A frase escrita no `insights.md`
depois da 0015 — *"todas as outras têm um `_manage FOR ALL`, que cobre update"* — é
o que fez a busca falhar: procurava-se tabela **sem** política de update, e esta
tinha uma. E a barra não pegava porque a checagem 6 sobe a fila com **todas** as
capacidades e a checagem 8 dá `dispatch` junto com `place_order`. A **checagem 9**
sobe a fila duas vezes pela capacidade **mínima** de um papel real, e ela morde:
sem a migração, reprova com `new row violates row-level security policy`.

### 2. ~~"Apagar tudo" não apagava nada depois da primeira produção~~ — alta, fechada

`src/data/erase.ts`

O conjunto fechado conhecia **12** das **21** tabelas do aparelho. Cinco das nove que
faltavam apontam para `items` ou `locations` com `ON DELETE RESTRICT` — e é
justamente `items` e `locations` que o apagar-tudo apaga. Toda corrida de produção
grava um `lots`, então a partir da **primeira corrida** o SQLite levantava `FOREIGN
KEY constraint failed`, a transação voltava atrás, nada era apagado, e a tela
mostrava texto cru de SQLite em inglês — depois do toque.

### 3. ~~Apagar "compras" apagava o livro-razão inteiro~~ — alta, fechada

`src/data/erase.ts`

`tablesFor('purchases')` começa com `movements`, e o `DELETE` é por empresa: levava
produção, contagem, perda, transferência e saída. A confirmação dizia *"isso apaga
as compras, e zera o custo médio"*. Não dizia que um movimento ia. Irreversível pelo
texto da própria tela, e sem cópia no servidor.

A regra da casa já era essa — a confirmação diz o que vai acontecer, com os números
por extenso. **Faltava o número.**

### 4. ~~A guarda comparava uma lista escrita à mão consigo mesma~~ — média, fechada

`src/data/erase.test.ts`

Ela percorria um `Record` com as mesmas doze entradas do union e perguntava se cada
uma estava na lista — *"todo membro do conjunto fechado está na lista do conjunto
fechado"*. Uma tabela fora do union era invisível **por construção**: o autor do
mapa e o autor da lista eram a mesma pessoa lembrando das mesmas doze tabelas.

Agora ela **lê** `db.ts` — as tabelas e as arestas de RESTRICT, inclusive as que
entram por `ALTER` em migrações posteriores. É o mesmo conserto que o `db:verify`
fez quando parou de rodar como superusuário: perguntar ao sistema em vez de à
lembrança.

E ela achou mais na primeira execução — **um deles alarme inventado**, cobrando de
"apagar produtos" a regra do "apagar tudo". Não vale: `blockerFor` recusa aquelas
áreas **antes** do toque, com o número junto, que é a Lei 5. Só o `all` não tem
rede, e a premissa está presa no teste com contagens que bloqueariam qualquer outra
área.

## O que a auditoria abriu — a fila de agora

**A auditoria está entregue**: dez frentes, trinta achados, em `docs/auditoria.md`
com severidade, cenário e o que ela **não** conseguiu olhar. Ali está o texto para o
dono; aqui está a ordem de trabalho, que é o que a próxima sessão precisa. A regra da
casa vale igual: *item fechado sai daqui no mesmo commit que o fecha*, e o número do
achado nunca muda — quem já leu o documento leu aquela lista.

Fechados, na ordem em que caíram: **1** (item e local de outra empresa, migração
`0029`), **3** (custo médio depois do estorno), **6** (a contagem que prometia um
número e gravava outro), **4** (o aviso de validade segue o lote, e a conta de
prometer passou a somar todas as nossas salas) e **5** (a produção com insumo na
câmara: a tela lê o piso da UNIDADE — piso, câmara e almoxarifado —, impede em vez de
reclamar, diz onde o insumo está, e o erro do livro-razão virou frase de tela nos três
idiomas; o recorte por unidade e o consumo saindo da sala que tinha o insumo entraram
em 8 de setembro, ver *"De onde a produção consome"*) e **8** (a
órfã que a fila guardava depois de apagar uma área) e **9** (o backup do Android, que
levava o livro-razão para a conta Google de quem estivesse no aparelho) — este último
junto com o `versionCode` que colidia, que era um dos médios e o mais barato deles. E
**2**: a compra, a contagem e a perda passam a ter grupo, logo estorno, logo a porta
para desfazer na tela do insumo. E **10**: as seis paletas passaram a respeitar a
régua de contraste da WCAG, com guarda que lê as cores do arquivo de tokens. E **11**:
idioma e moeda viraram escolha da empresa, com o aparelho como palpite do primeiro dia
— o que fechou de passagem o fuso chumbado em São Paulo, que fazia Manaus imprimir a
data errada na etiqueta.

**Com isso a lista de severidade ALTA da auditoria está vazia.** O que sobra são os
médios, e o que ela declarou não ter conseguido olhar: a segunda lente adversarial, o
teste de carga real, as duas vulnerabilidades que o `npm audit` não alcança deste
ambiente, e **nada visto numa fábrica** — que é a lacuna que nenhum teste fecha.

**O 5 deixou uma pergunta, e ela caiu em 8 de setembro** — não por resposta do dono,
mas porque o mundo que ela oferecia não existia: a tela lia a unidade e a escrita
conferia uma sala, então **nenhuma corrida rodava** com a polpa na câmara. O padrão
passou a ser a unidade inteira, com o consumo saindo da sala que tinha o insumo. O que
ficou aberto é a outra metade — a "sala estrita" como configuração. O trajeto
câmara → almoxarifado, que era o bloqueio prático dela, **passou a existir** na mesma
noite. Ver *"De onde a produção consome"*.

### O que a revisão das quatro caras fechou — e o que ela deixou de pé

Fechados em 5 de setembro, com a foto ao lado de cada um: o `Field` desenhava a caixa
do Orgânico nas duas caras (39 campos); a espessura do traço estava copiada em 26
lugares em vez de morar no tema; o símbolo da moeda estava escrito na tela em três
campos, com oito moedas existindo; a `Landscape` prendia sol, nuvem, chuva e fumaça
por pixel na borda enquanto o céu esticava; o degradê sob a `Sparkline` punha massa
no Papel; a palavra do botão saía ilegível sobre a cor do Papel escuro; e a linha do
transporte cortava o nome do produto para caber o número.

**De pé, e nenhum deles está travado** — o P2 do primeiro caiu no dia em que o dono
disse que tem um tablet, e é isso que o item 1 conta:

1. **Refluir em colunas a 840 dp — DESTRAVADO, decisão do dono, 6 de setembro.**
   Eu tinha travado isto no portão P2 completando a frase *"eu mudaria isto se eu
   visse alguém usando um tablet"* e concluindo que ninguém usava. Errado: **o dono
   tem um.** *"eu tenho um tablet, depois a gente compila o apk e eu testo, bora pro
   seguinte."* O P2 não é uma regra sobre o mundo, é uma pergunta — e quando existe
   quem observe, ele deixa de travar.
   **Primeiro corte feito em 6 de setembro**, e o dono viu o primeiro corte antes de
   mim: *"só pode ser brincadeira que você ainda tem esse layout fora de padrão"*.
   Dois defeitos na foto, os dois consertados no mesmo dia: a grade deixava um buraco
   de três portas debaixo de "Pergunte" (cada linha tinha a altura do cartão mais
   alto), e as cinco abas se espalhavam em 900 dp com 150 dp de nada entre elas.
   Agora: quem pareia é escolha da tela (`pares` no casco), as peças **empacotam** em
   duas pilhas em vez de uma grade com linhas, um filho marcado `Inteiro` sai na
   largura toda, e as abas se juntam na mesma medida do conteúdo. Abaixo de 840 dp
   nada muda, com guarda.
   ~~**O que fica de pé:** o pé das duas colunas é desigual~~ — **FECHADO em 6 de
   setembro.** As peças passaram a ser medidas (`onLayout`) e a distribuição é
   escolhida por `src/components/colunas.ts`. Na gaveta do "Mais" o desnível caiu de
   uns 800 dp para uns 20: alternar punha "Cadastros" (cinco portas) e "Ajustes" do
   mesmo lado; medindo, "Lançamentos" e "Ajustes" se acomodam juntos à direita. Em
   "Relatórios" nada muda, e a foto explica: com três cartões, `[0,1,0]` já é o melhor
   corte que duas colunas permitem.
   **E o guloso sozinho não era melhor que alternar** — o teste desmentiu o docblock
   que eu tinha escrito: com as alturas `290,229,119,384,236` ele fecha com 90 e
   alternar fecha com 32, porque decide olhando só o presente. Por isso `distribuir`
   calcula as duas e fica com o pé menor: é o que faz "nunca pior que antes" ser
   verdade em vez de plausível.
   A prova final continua sendo o APK no tablet dele — o que é "padrão" de tablet se
   decide com o aparelho na mão.
2. **O cartão com desenho e sem título** deixa o glifo sozinho numa linha. Eram
   "três telas" por estimativa; **medido em 7 de setembro são 27 cartões em 15
   telas** — a lista das três (etiqueta do lote, clima, catálogo) era a das que eu
   tinha aberto. No Papel lê como dingbat de seção e funciona; no Orgânico é um
   crachá flutuando. Decisão de desenho, não defeito — mas a decisão vale para
   vinte e sete, não para três, e isso muda o tamanho dela.
3. **A pele virou ponto de extensão — 6 de setembro.** O dono olhou a foto do
   Orgânico e disse *"o q estava NEM ORGANICO ERA"*, e depois foi explícito sobre o
   porquê de isso importar: *"qq tema futuro ou o q vc chama de skin tem q poder ser
   aplicado sem problemas… futuramente a gente vai criar mais skins"*.
   O defeito era estrutural: o Orgânico era o Papel com a cena trocada, e mais oito
   componentes decidiam sozinhos com `skin === 'papel' ?`. Agora a pele **declara os
   traços** (`genero`, `tintaCheia`, `marcaVemDoTom`, `titulo`, `radius.controle` e,
   desde 7 de setembro, `cabecalho`) e **veste a capa** (`src/home/capas/`: casco de
   página, casco de peça, e as peças que ela desenha à sua maneira). Uma pele nova
   escreve isso e ganha as dezesseis peças funcionando; `registro.test.ts` recusa
   quem voltar a decidir pelo nome.
   **O que fica de pé:** a foto no emulador desta sessão. A máquina não tem
   virtualização e o app leva minutos para assentar; a prova final continua sendo o
   APK no aparelho do dono.

## A FILA DE AGORA — 6 de setembro, noite

O dono perguntou duas coisas: *"alguma coisa mais q vc acharia bom acrescentar? e
vou inverter a pergunta, vc removeria ou alteraria alguma coisa?"* — e depois de
ouvir: *"faz tudo então, coloca em ordem no roadmap"*. Está aqui, em ordem, com o
motivo de cada posição. A ordem não é por tamanho nem por gosto: **é por quanto
custa o erro se a coisa nunca for feita.**

Três dela são achado de varredura desta noite e vêm com a medida ao lado; cinco
são coisas que eu **removeria ou mudaria**, e essas são as que ninguém pede.

---

**O estado em 7 de setembro, depois da auditoria — o que está aberto e o que cada
coisa espera.** Toda linha abaixo tem a medida escrita ao lado do item, e
`src/plano.test.ts` a roda: se alguém construir o que aqui está como aberto, a suíte
fica vermelha até este parágrafo mudar.

| o que | espera |
|---|---|
| **o `erase` não tem para onde ir** (2b) | **decisão sua.** Duas saídas escritas; a recomendação é B, o marcador. É P3 — migração, e o lado errado destrói dado num servidor. **Ela trava o item 2**, que é o transporte para o servidor. |
| ~~**quem registra a venda**~~ | **FEITO em 8 de setembro.** O padrão é a contagem deduzir; o PDV entra depois como configuração. Ver *"`sale` TEM escritor"*. |
| **o cliente OAuth do Google** (0c) | **você**, para o backup subir sozinho. O 0a e o 0b estão feitos: o razão sai do aparelho por cópia manual hoje. |
| **ligar o `pg_cron`** no projeto do servidor | **você, um clique no painel.** A `0045` já deixou o agendamento escrito e guardado; sem a extensão os pedidos de Reset acumulam e nada é destruído — o lado seguro de errar. Medido em 8 de setembro: a extensão está disponível e não instalada. |
| **cinco minutos de TalkBack** (3) | **você, com o tablet.** A guarda prova que todo alvo se anuncia; ninguém nunca ouviu. |
| ~~a sala do tacho~~ **de onde a produção consome** (5) | **padrão decidido em 8/9 sob defeito** — a unidade inteira, porque com a polpa na câmara nenhuma corrida rodava. Falta a "sala estrita" como configuração. |
| **compras inteligentes** (6) | **tempo.** O mecanismo está construído e lido em duas telas; falta entrega observada de fábrica de verdade para calibrar. **E uma armadilha medida em 8 de setembro, escrita aqui para quem construir:** o fornecedor é um NOME digitado (`purchases.supplier_name`), e a tabela `suppliers` do servidor — com `promised_lead_days` e tudo — tem **zero escritores e zero leitores** desde a `0002`. Agrupar prazo observado por nome faz *"Distribuidora Silva"* e *"distribuidora silva"* serem dois fornecedores, cada um com metade das entregas: o prazo sai pela metade e ninguém percebe, porque o número é plausível. É a mesma armadilha que a transportadora evitou nascendo com índice único por `lower(trim(name))` — e ela quase me pegou, porque eu ia copiar o molde de `suppliers`. |

**Fora dessas seis, não há item de código aberto na fila.** É por isso que a rodada de
7 de setembro foi de auditoria e de rede: com a construção travada em decisão, o
serviço que sobrava era medir o que o plano afirmava — e ele afirmava 38 coisas que o
código desmentia.

### FEITO em 7 de setembro — o Orgânico deixou de ser o Papel fora da capa

<!-- medida: presente src/theme/tokens.ts :: cabecalho: 'vinheta' -->

Duas correções do dono, no mesmo dia, com a mesma forma: **a capa estava certa e o
resto tinha ficado para trás.**

| o que ele viu | o que era | o que ficou |
|---|---|---|
| *"o cabeçalho animado pegou as animações do tema do Papel"* | a cena lia cor e espessura da pele e desenhava UMA geometria — traço fino, canto duro | traço `cabecalho: 'vinheta' \| 'paisagem'`, despacho por `Record` (pele nova quebra a compilação em vez de cair no Papel calada) |
| *"tem elemento aí do tema legado q está atrapalhando tudo"*, circulando a quina de um cartão | `Card` desenhava a própria caixa: canto arredondado com borda esquerda grossa, que na curva vira uma cunha torta | `Card` pergunta a roupa da pele (`Bloco`); o ramo legado foi apagado, não remendado |

Três defeitos que **só a foto pegava**, achados no mesmo passe:

- a engrenagem sumia depois de começar a girar — `transform` de `animatedProps`
  substitui o eixo de `origin`, e a peça gira em torno de (0,0);
- o botão de um controle saía da prancheta pela esquerda — `Cursor` recebia centro e
  curso, e 0,18 com curso 0,55 dá −0,095; passou a receber começo e fim;
- o bosque estava no mesmo pixel nas dezoito telas — o desvio agora sai do nome da
  cena, determinístico.

**Nível de evidência — E3, e com duas correções de método junto.** A prova olhada foi
a foto de `/settings` a 393 dp — a MESMA tela que o dono circulou, depois: cunha
ausente, engrenagens girando, faixa sangrando, cartão branco sobre chão verde.

*E a foto não é citável como evidência daqui, o que é a segunda correção.* `.shots/`
está no `.gitignore`, então `.shots/ajustes-393.png` — como este parágrafo dizia até 7
de setembro — é um caminho que só existe na máquina da sessão que o escreveu. Quem ler
o plano depois não tem como conferir. **A evidência durável são os dois guardas** de
`src/home/capas/registro.test.ts` (a cunha da quina e a tinta declarada), os dois
provados contra os arquivos reais de antes do conserto; a foto é o que convenceu a
mim, e ela se refaz com `node scripts/aparelho.mjs fotos /settings`.

**A correção de método:** as primeiras horas de foto saíram todas em **720 dp** —
tablets — porque o emulador tinha `wm density 240` preso de um teste antigo, e eu
li margem e composição na largura errada. A foto não avisa: sai 1080 px de qualquer
jeito. Agora avisa — a legenda de toda foto traz a conta e marca ⚠ TABLET acima de
600 dp (`scripts/aparelho.mjs`), provado nos dois sentidos.

Depois das duas correções, três coisas que saíram da MESMA regra ("conserto de pele
não termina no arquivo que o mostrou") aplicada de propósito, procurando:

- **A paisagem sangra** quando a pele desenha paisagem. Na capa ia de borda a borda;
  nas outras vinte era um retângulo com margem — janela virou foto colada.
- **O chão do Orgânico ganhou verde de verdade** (`#F3F7F3` → `#E4EFE7`). Eram três
  por cento de diferença para o cartão branco: o cartão só existia pela sombra. E ao
  medir apareceu o que ninguém sabia — a paleta estava **presa**, com `apricot` sobre
  `sunken` em exatos 4,50:1. Os onze acentos desceram junto, matiz e saturação
  intactas.
- **A barra de abas é do material da pele.** Era `paper` nas duas; com o chão novo ela
  virou a cor da página com uma linha invisível. Numa pele de superfícies a barra é
  superfície.
- **O `CountUp` existia só na capa** — e o dono tinha pedido *"quero em todas as
  telas"*. Passou a valer para o número de que a tela fala: estoque parado, custo
  unitário, perdas, produção de hoje, destinos do dia, insumos guardados.

**O ESCURO foi olhado, e passou.** Ele é onde este projeto já se queimou uma vez — uma
caixa preta com um sol dentro chegou na tela do dono —, então não podia ficar em
"deve estar certo". A fábrica sai âmbar acesa sobre a noite verde, as engrenagens
ganham miolo âmbar, e o chão continua sendo a matiz escolhida escurecida, que é o que
uma colina faz à noite. Foi a melhor das quatro caras.

**Com uma ressalva de nível, dita porque ela importa:** a prova é do NAVEGADOR
(`npm run shot -- --rota /settings,/production --escuro --com-dado`), não do aparelho.
Isso prova os tokens e a composição — que é o que estava em dúvida —, e não prova
densidade nem toque. O emulador atrapalhou três tentativas seguidas (System UI
travando sob carga, e o `system_server` subindo quebrado uma vez), e a foto de
aparelho no escuro fica para quando ele estiver recém-subido e sozinho na máquina.

**O que NÃO foi feito e por quê:** a paleta do Orgânico continua clara. O dono pediu
*"dá mais cor para o tema papel"* — o Papel já ganhou os oito acentos escurecidos; o
Orgânico ainda não foi olhado sob essa régua, e a hierarquia escrita manda o Papel
primeiro.

### 0b-bis. ~~Mais de uma unidade de tudo~~ — a FÁBRICA plural FEITA em 8 de setembro

<!-- medida: presente app/places.tsx :: 'factory' -->

*"a gente não considerou que de repente possam existir mais de 1 unidade da
fábrica… assim como vários funcionários produzindo e várias transportadoras assim
como as várias unidades de loja e clientes."*

**Medido antes de responder, e duas das quatro já funcionam.**

| | estado | a medida |
|---|---|---|
| lojas e clientes, várias | **já funciona, sem limite** | `locations` aceita quantas linhas quiser e `app/places.tsx` oferece as duas espécies |
| vários funcionários produzindo | **já funciona, desde 6 de setembro** | tabela `people` com PIN, e os sete `INSERT INTO movements` carimbam `operator_id` |
| **várias fábricas** | **o esquema suporta, o app não deixa** | `factory` é a PRIMEIRA espécie de `location_kind` na `0001`; `app/places.tsx:229` oferece quatro e não a inclui |
| **transportadoras** | ~~não existe~~ **FEITA em 7 de setembro** | tabela `carriers` (migração 0044 e V24), tela `app/carriers.tsx`, escolha na separação e o nome de quem levou no cartão do destino — o leitor no mesmo commit, para não repetir `suppliers` |

**As duas que faltam têm pesos opostos, e isso decide a ordem.**

A **transportadora era barata e está feita** — e o que ela ensinou foi sobre o molde
que eu ia copiar. `suppliers` está no esquema desde a `0002` com **zero escritores e
zero leitores**: `purchases.supplier_id` nunca foi escrito, e quem vive é o
`supplier_name` digitado. Copiar aquilo criaria a segunda tabela morta. Então
`carrier_id` entrou no mesmo commit que a tela que escolhe e a linha que mostra quem
levou, e ela **não é um lugar**: o docblock das espécies já decide o caso vizinho —
*"caminhão é caminho, não é sala nem destino"*.

Duas decisões de desenho que o uso vai medir: a escolha só aparece quando há
transportadora cadastrada (fábrica que entrega no carro dela nunca vê a pergunta), e o
cartão do destino **cala** quando o dia teve carga de dois jeitos, em vez de nomear a
primeira — meia verdade num cartão é pior que silêncio.

A **segunda fábrica**: medida em 8 de setembro, e o custo não estava onde eu escrevi.

**Não falta migração — em nenhum dos dois lados.** O servidor modela N lugares por
empresa desde a `0001` (`locations_company_idx` não é único, e o único `unique` que
existe é `(id, company_id)`, alvo de chave estrangeira composta — a `0019:34` diz
literalmente *"quem administra duas lê as duas"*). A `stock_balances` já agrupa por
`location_id`. O aparelho idem: `locations` sem restrição de espécie, e o índice de
saldo já é `(company_id, item_id, location_id, occurred_at)`.

~~**O portão é UMA linha de tela.**~~ **ABERTO em 8 de setembro.** `app/places.tsx:229`
oferece `factory`, e a justificativa que a segurava — *"nasce sozinha (`ensureLocation`)
e não se cadastra"* — era verdadeira para a PRIMEIRA unidade e só para ela. A guarda
`the place form offers every kind the ledger knows` pegou o registro virando mentira no
mesmo commit, que é o trabalho dela.

**O que entrou junto, porque sem isso a porta abria para um defeito calado:**

- **`src/data/unidade.ts` — o aparelho pertence a uma unidade**, como já pertence a uma
  empresa, e pelo mesmo motivo: o celular da unidade de Marília fica em Marília e não
  muda de prédio no meio do turno. Perguntar a cada movimento seria a Lei 1 quebrada
  duzentas vezes por dia para confirmar um fato que não muda. Lido no boot, junto da
  empresa, antes da primeira tela.
- **Onze pontos deixaram de eleger "a fábrica" pelo id** e passaram a perguntar
  `unidadeDaqui()`: `app/transfer.tsx`, `app/picking.tsx`, `app/production/new.tsx`
  (duas), `app/(tabs)/production.tsx`, `app/inputs/[id].tsx` e as quatro de
  `src/data/assistantData.ts`. A guarda `no screen asks for the default place when it
  means "here"` recusa a volta.
- **`ehUnidade(kind)` em `src/domain/ledger.ts`** — a única régua para *"quais são as
  fábricas"*, no molde de `INTERNAL_PLACE_KINDS`, que nasceu do mesmo defeito de
  predicado escrito três vezes.
- **A escolha em `app/settings.tsx` só existe com mais de uma unidade.** Fábrica de uma
  nunca vê a pergunta.
- **O teste que prova onde o movimento cai** (`src/data/unidade.test.ts`) mede pelo
  saldo POR LUGAR, que é função que não sabe que o módulo existe — e fixa a
  pré-condição de 40 kg na primeira unidade, sem a qual a asserção compararia zero com
  zero e passaria por acidente.

~~**O que continua aberto — as consultas que somam a empresa inteira.**~~ **AS DEZ
FECHARAM em 8 de setembro**, junto com a peça que faltava embaixo delas (a migração 0046:
uma sala passa a ficar DENTRO de uma unidade, sem o que nenhum recorte é possível sem
derrubar o número de quem já usa).

**E duas coisas que eu tinha registrado como decisão de produto não eram.** Eu ia
perguntar ao dono se um lote já entregue numa loja deve continuar avisando de validade, e
se transferir entre unidades conta como consumo. As duas respostas já estavam no
repositório: a primeira em dois comentários que se contradiziam (cada um certo sobre a
falha do outro), a segunda numa coluna que já era escrita e ninguém lia
(`counterpart_location_id`). **Pergunta que o código já responde é rodada do dono
gasta** — e a régua para separar uma da outra é a mesma de sempre: medir antes de
perguntar, não só antes de construir.

O que ficou, com o que cada uma custou:

| função | por que dói | quem lê |
|---|---|---|
| ~~`stockAgainstOrders`~~ **FEITA em 8 de setembro** | era a pior. A unidade agora é parâmetro **obrigatório** — leitor de saldo com lugar opcional é leitor que erra calado, a mesma lição do `recordLoss`. Conta a unidade e o que está DENTRO dela, e o atalho de compatibilidade faz sala INTERNA sem pai pertencer à primeira unidade, espelhando o `WHERE` do backfill: sem isso um teste desta suíte viu **20 no lugar de 170** | os três chamadores passam `unidadeDaqui()` |
| ~~`listItems` / `findItem`~~ **FEITAS em 8 de setembro** | o parâmetro passou a ser `{ sala }` OU `{ unidade }`, e são duas perguntas diferentes: a sala é a prateleira exata, a unidade é ela **mais as salas dentro dela**. Um campo só faria a unidade somar apenas o pátio e deixar a câmara fria de fora — o defeito de somar de MENOS, que é o mais calado porque um número menor parece prudente. Capa, ficha de insumo, produção, insumos e avisos passaram a pedir a unidade; **a compra continua da empresa**, por decisão escrita de 1 de setembro — é ela que alimenta a média móvel do custo, e o mesmo grama de açúcar não custa uma coisa em cada sala |
| ~~`runningOut` / `dailyOutflowOf`~~ **FEITAS em 8 de setembro** | eram piores que somar junto: no modo empresa a regra DESCARTA transferência como saída, então mandar insumo de A para B deixava de contar como consumo de A e a cobertura de A ficava infinita. Hoje a regra é *"o par está DENTRO do escopo?"* — transferência interna não conta, a que sai conta —, e as **sete** chamadas passam `{ sala }` ou `{ unidade }`. Conferido chamada por chamada em 9 de setembro, porque esta linha continuou dando o item como aberto depois de ele fechar |
| ~~`expiringSoon`~~ **FEITA em 8 de setembro** | e ela resolveu uma **contradição escrita em dois lugares**: o docblock da consulta dizia que somar a empresa avisa sobre lote já ENTREGUE, o comentário da capa dizia que filtrar por sala EMUDECE o aviso quando o picolé vai para a câmara. Os dois certos sobre a falha do outro — a unidade é a granularidade que serve às duas |
| ~~`itemMovements`~~ **FEITA em 8 de setembro** | mesma forma `{ sala } \| { unidade }`. O caminho do assistente é o pior dos dois: ele responde por FRASE, e frase afirmativa não tem como dizer de onde veio — *"conferido em 3/9"* com a conferência da outra cidade passa como fato |
| ~~`recentRuns` / `lotsOn`~~ **FEITAS em 8 de setembro** | recortadas pela PRODUÇÃO, que é onde o lote tem lugar. E a aba de Produção era incoerente com ela mesma: a régua de acabar já se recortava pela unidade enquanto a lista de lotes era da empresa |
| ~~`findLot`~~ **não era isto** | o docblock da tela diz que ela responde *"quanto rendeu"*, e a consulta soma exatamente `kind = 'production'`. Rendimento não tem lugar — o número está certo. A regra de procurar a decisão antes de acusar, pagando de novo |

E duas que **não** mudam, por decisão de 1 de setembro: as médias móveis de custo
(`:412` e `:2033`) continuam da empresa, porque *"o mesmo grama de açúcar não custa uma
coisa na câmara e outra no almoxarifado"*.

### ~~A capa mistura duas granularidades na mesma tela~~ — achada e FECHADA em 9 de setembro

<!-- medida: presente app/(tabs)/index.tsx :: today\.to, \{ unidade -->

**Achado ao conferir se a linha acima ainda valia.** Uma varredura pelas consultas que
somam `movements` sem recorte de lugar devolveu **catorze** funções; a maioria é
legítima (as médias de custo por decisão escrita, e as que agrupam POR lugar, onde o
recorte seria redundante). Sobraram cinco que respondem *"o que aconteceu aqui"* e
somam a empresa: `productionOn`, `productionBetween`, `shipmentsOn`,
`openProductionRuns` e `lossesOn`.

O sintoma está num bloco só, e dá para ver a olho em `app/(tabs)/index.tsx:160-178`:
`runningOut`, `stockAgainstOrders` e `recentRuns` pedem `{ unidade: unidadeDaqui() }`,
e as vizinhas na mesma lista não pedem nada. **Com duas unidades a manchete da capa
conta as duas cidades e o conselho embaixo dela conta uma** — lado a lado, sem
ninguém dizer que a régua mudou no meio.

É a mesma incoerência que a aba de Produção já teve (a régua de acabar recortada pela
unidade enquanto a lista de lotes era da empresa), e ela sobreviveu porque o recorte
foi feito consulta a consulta em vez de TELA a tela. A régua que sai: quando uma tela
ganha escopo, o que se confere depois não é a consulta consertada — é a **lista de
irmãs no mesmo `Promise.all`**.

Rendimento continua sem lugar (é do lote, e o `findLot` já foi absolvido por isso);
*"o que esta fábrica fez hoje"* tem lugar, e é o da unidade.

~~**E um defeito que o mapa achou de passagem, ativo HOJE com uma unidade só**~~ —
**CONSERTADO em 8 de setembro.** `app/inputs/[id].tsx` gravava perda sem passar
`locationId`, então ela caía no lugar padrão mesmo com a tela aberta em
`?sala=<câmara fria>`. O número mostrado é o da câmara (`findItem` recebe a sala), a
perda saía do almoxarifado, e os **dois** saldos ficavam errados de uma vez: o da
câmara alto, o do almoxarifado baixo, e **a soma da empresa certa** — que é a parte
que faz ninguém notar.

A perda passou a usar a mesma sala da contagem, e a não ser oferecida onde a contagem
também não é: só se perde o número que está na tela. E a guarda `every screen that
writes to a room names the room` cobre a FORMA, não a linha — escritor de razão com
sala opcional é escritor que erra calado, e ela vale para `recordLoss`,
`recordCount` e `recordProduction`.

**Mas ele continua P3, e por um motivo melhor que o que eu tinha escrito.** Não é a
migração: é que `movements_are_immutable` é `before update or delete`, então
`location_id` de um movimento que já subiu **não se corrige nunca** — nem por
migração, nem por estorno (o estorno cria linha nova; a antiga fica carimbada). A
maquinaria de repontar de `src/data/adocao.ts` só funciona antes da primeira subida, e
recusa com `jaSubiu` depois dela.

Daí a forma, e ela é forçada em vez de escolhida:

1. **A primeira unidade guarda o id da empresa para sempre.** `defaultLocationId`
   devolver `company_id` não é dívida a pagar: é o carimbo de todo movimento já
   gravado, e ele é permanente. Dar-lhe um id próprio depois de subir é impossível.
2. **As unidades seguintes nascem com uuid.** A assimetria é definitiva, e a
   consequência é a regra: **nenhum código lê significado no id de um lugar.** Quem
   compara `id === company_id` para dizer *"esta é a fábrica"* está errado no dia da
   segunda — e são quinze pontos hoje (`app/transfer.tsx:138`, `app/picking.tsx:87`,
   `app/production/new.tsx:212`, `app/(tabs)/production.tsx:149`,
   `app/inputs/[id].tsx:323`, `src/data/assistantData.ts:51,54,65,69`,
   `src/assistant/skills.ts:740,745,797,941`).
3. **A espécie é que responde "quais são as fábricas"**, não o id — uma peça só, do
   lado do domínio, no molde de `INTERNAL_PLACE_KINDS`.
4. **A escolha só aparece quando há mais de uma** (Lei 1: nunca peça o que o sistema
   pode deduzir). Fábrica de uma unidade nunca vê a pergunta, exatamente como fábrica
   sem transportadora nunca vê a escolha de quem levou.
5. **`recordPurchase` é o único escritor que não aceita sala** — toda compra cai no
   lugar padrão, sempre (`repository.ts:441`). Com duas unidades, a compra de uma
   entra na outra, calada.
6. **O nome vazio vira problema de tela na hora**: `nomeDoLugar` desenha "Fábrica" para
   o lugar sem nome, em seis telas. Duas unidades, e a primeira continua "Fábrica"
   enquanto a segunda tem nome — o operador vê duas linhas e uma delas não se
   identifica.

**E o que NÃO muda, que é a parte que eu ia errar de novo:** as duas médias móveis
(`repository.ts:412` e `:2033`) continuam somando a empresa inteira, por decisão de 1
de setembro — *"o mesmo grama de açúcar não custa uma coisa na câmara e outra no
almoxarifado"*. Generalizar as três consultas do mesmo jeito quebraria o custo para
consertar o saldo.

**E ela arrastou a pergunta de onde a produção consome, um andar acima** — respondida
em 8 de setembro: a corrida consome da **unidade**, nunca da empresa. Com duas unidades
a resposta errada autoriza uma corrida de uma cidade a consumir a polpa da outra, e o
recorte por unidade é o que fecha isso nos dois lados. Falta a "sala estrita" como
configuração; ver *"De onde a produção consome"*.

**O estudo que o dono pediu — 7 de setembro: três das quatro quebras não eram porte.**
Doze agentes, cada resposta atacada por três, e cada afirmação que sobrou conferida por
leitura depois. Uma delas estava errada, e está registrada como errada.

| a quebra que ele nomeou | o veredito | por quê |
|---|---|---|
| **o aparelho como único lar do razão** | **é a única de verdade, e é a primeira** | não espera duas fábricas nem duzentas pessoas: quebra na primeira subida de um aparelho só — item 0b-ter |
| `fábrica = empresa` | **não é urgente** | nenhuma tela oferece a espécie `factory`, então ninguém cria a segunda; e o que ela arrasta (a descida de `locations`) é pré-requisito do 0b-ter, não o contrário |
| **transportadora** | **barata, com uma armadilha** | `suppliers` (migração 0002) tem zero escritores e zero leitores, e `purchases.supplier_id` nunca é escrito — só `supplier_name` vive. Copiar aquele molde cria a segunda tabela morta: `carriers` entra **com tela no mesmo commit**, e a coluna no ato da carga só depois de haver leitor |
| **a grade com duzentos nomes** | **urgência fabricada** | `people` é dimensão e não razão, então afrouxar a unicidade de nome depois é de graça; o que entra agora é espelhar no aparelho a restrição que o servidor já tem — hoje o aparelho aceita duas "Maria" e o servidor recusaria a segunda. Busca acima de N nomes é configuração de peça |

**E a correção do próprio estudo, registrada porque o número foi dito antes de ser
conferido:** ele afirmou que `puxar` e `empurrar` não têm chamador. Os dois têm —
`empurrar` quatro vezes em `app/settings.tsx`, `puxar` uma em `app/account.tsx:80`. O que
sobra é menor e continua sendo dívida: a configuração da casa desce **só quando a tela da
Conta abre**, nunca no boot, então um aparelho que nunca abre Conta trabalha com a
configuração dele.

### 0b-ter. ~~A empresa deste aparelho é uma constante compilada~~ — FEITO em 7 de setembro

<!-- medida: presente src/data :: export async function adotarEmpresa -->

`LOCAL_COMPANY_ID` (`src/data/empresa.ts`) é a MESMA constante em toda instalação, e é ela
que carimba cada linha do razão. Quando o dono cria a empresa, `criarEmpresa` devolve o id
verdadeiro do servidor e `app/account.tsx:130` **joga fora**. Duas consequências, e nenhuma
delas aparece antes de haver servidor:

- a primeira subida é recusada em bloco — o servidor não conhece a empresa `0000…1` e a
  conta que empurra não é membro dela: chave estrangeira e política, as duas;
- o lugar padrão tem o id da própria empresa (`defaultLocationId` devolve o `company_id`),
  então dois aparelhos colidem no mesmo lugar ainda que a empresa estivesse certa.

**Por que a barra nunca viu:** a checagem 6 do `db:verify` insere no Postgres descartável
uma empresa com exatamente essa constante (`scripts/verify-migrations.sh`, `DEVICE_ACCOUNT`)
— ela **fabrica à mão a condição que esconde o defeito**. É a família de sempre: guarda que
compara duas coisas escritas pela mesma mão.

**Os cinco passos, todos feitos — e o que cada um virou:**

1. ~~a empresa deste aparelho vira **fato guardado** (`app_meta`, chave `company.id`)~~ —
   **feito**: `src/data/empresa.ts` guarda o fato, `empresaDaqui()` responde de memória, o
   boot lê o disco antes da primeira tela, e as 211 chamadas das 31 telas passaram a
   perguntar em vez de citar a constante. Restaurar cópia relê, porque a cópia repõe
   `app_meta` inteiro;
2. **a adoção reescreve o carimbo numa transação** (`src/data/adocao.ts`): copia o lugar
   padrão com o id novo, reponta as sete colunas que apontam para `locations`, apaga o lugar
   velho, troca `company_id` nas 23 tabelas, conserta o `row_id` da fila, e grava o fato
   **na mesma transação** — se o aparelho desligar no meio, ou tudo voltou ou tudo valeu;
3. **o lugar padrão ANDA em vez de ganhar id próprio** — e isto é mudança de plano medida:
   o pragma que o outro caminho pedia é dispensável, e enquanto `defaultLocationId` devolve
   o `company_id` o lugar padrão passa a ter o uuid da empresa, que é único no mundo. Quebrar
   o atalho fica para o 0b-bis, que é quem precisa dele (duas fábricas);
4. **a fila se recusa a subir** sem empresa adotada, e a recusa é um campo próprio do
   relatório (`recusa: 'semEmpresa'`) e não uma frase em `error` — *"eu não tentei"* e *"o
   servidor recusou"* pedem coisas diferentes de quem está com o aparelho;
5. **a barra LÊ do aparelho qual empresa semear** (`-- DEVICE_COMPANY=`), e recusa se ela for
   o mesmo uuid da conta. Era aqui que a checagem 6 se provava sozinha.

**E três recusas, cada uma irrecuperável se passasse:** linha que já subiu (`sent_at`
preenchido — o razão do servidor não se reescreve), exemplo semeado ainda no aparelho
(nota inventada não entra no livro da fábrica; a tela manda apagar em Ajustes, onde a
conta do que sai já é mostrada), e id já ocupado (cópia restaurada de outro aparelho).
Cada uma tem teste, e cada teste foi provado por mordida — quebrei a adoção em quatro
lugares e a suíte mordeu nos quatro.

**O que a medição acrescentou ao desenho, e ela derrubou três coisas que eu ia fazer:**

- **23 tabelas** têm `company_id` e **7 colunas** apontam para `locations` — nenhuma com
  `ON UPDATE`, então trocar a chave primária do lugar falha na hora. O caminho provado é
  copiar a linha nova, repontar os sete filhos e apagar a velha: sem pragma nenhum, e o
  `ON DELETE RESTRICT` de `movements` vira rede de graça.
- **Reescrever o `payload` da fila era trabalho morto** — o payload é `{}` em 25 dos 26
  `enqueue`. O que trava a fila é o `row_id`: o lugar padrão é enfileirado com o id da
  empresa, e um `row_id` órfão faz o serializador levantar exceção e a fila nunca mais
  andar.
- **A adoção tem de recusar em três casos**, e cada um é irrecuperável se passar: alguma
  linha já subiu (`sent_at` preenchido — o razão do servidor não se reescreve), o exemplo
  semeado ainda está aqui (noventa dias de nota fabricada entrariam no livro da fábrica
  como fato), e já existe linha com o id novo (adoção rodada duas vezes).
- **O servidor tem chave estrangeira COMPOSTA** (`location_id, company_id`) e o aparelho
  não tem nenhuma composta: uma adoção pela metade passa no SQLite e é recusada em bloco
  pelo Postgres. A rede é a transação única.

É **P3** — carimbo de `movements` —, então a forma é mostrada antes de rodar. E é **antes do
item 2** (o transporte): tudo que subir antes disto sobe carimbado errado.

### 0. ~~O backup~~ — 0a e 0b em 6 de setembro, **0c (Drive) em 8 de setembro**

<!-- medida: presente src/nuvem/drive.ts :: appDataFolder -->

**E o automático virou a regra dos três — decisão do dono, 8 de setembro:** *"os
backups e sincronizações devem ser automáticos, ok. assim como as atualizações
ota."* As três estavam construídas e as três dependiam de alguém lembrar: a fila só
subia por um botão em Ajustes, a cópia só por um toque, e a atualização chegava um
lançamento atrasada. Coisa que depende de lembrança é coisa que não acontece na
fábrica — e a que não acontece aqui é justamente a que só se descobre no dia em que
o celular morreu.

`src/nuvem/sozinho.ts` é a regra: **fila, cópia, atualização, nessa ordem**, e
inverter as duas primeiras custa dado (uma cópia feita antes da subida guarda um
estado que o servidor ainda não conhece, e restaurar depois ressuscita linhas que já
estavam a caminho). Nenhuma peça que falha derruba a rodada nem impede as de baixo —
quem chama é o boot, e exceção ali é tela branca na mão de quem só queria abrir o
aplicativo. Roda no boot e na volta ao primeiro plano (`app/_layout.tsx`), porque o
celular da fábrica não é reiniciado: fica semanas aberto, e automático que só roda no
boot roda uma vez por mês.

A cópia sobe **uma vez por dia e só se o razão cresceu** — cópia idêntica à de ontem
não protege nada e consome o dado de quem está no 3G da estrada. A atualização é
baixada e **não é aplicada**: quem aplica é a próxima abertura. Reiniciar no meio de
uma contagem na câmara fria trocaria dado por novidade, e quem perde a contagem uma
vez não conta de novo.

**O que o Drive é, em uma linha:** `drive.appdata` — a pasta privada deste
aplicativo, que nenhum outro lista e que o dono não apaga limpando o Drive. Escopo
mínimo: não lê um arquivo dele, não lista o Drive dele, não apaga nada.

**A cicatriz que este item pagou, e ela seria muda:** o manifesto gerado já tinha
`EXPO_UPDATE_URL` e `CHECK_ON_LAUNCH=ALWAYS` — o aparelho perguntava por atualização
em toda abertura. Faltava o **canal**, que o `eas build` injeta do `eas.json` e que
um `gradlew assembleRelease` daqui não injeta. Sem canal o servidor responde que não
há nada, e o aplicativo fica para sempre na versão instalada **sem nenhum erro**.
Agora o canal está no `app.json` (`updates.requestHeaders`), com guarda em
`src/release.test.ts`.

**O que falta é seu, e é uma coisa só: criar o cliente OAuth no Google.** O app.json
tem os dois campos vazios (`extra.driveClientId`, `extra.driveRedirect`) e, vazios,
o backup automático **pula** a cópia com motivo `semDestino` — nada quebra, e o
botão de guardar à mão continua funcionando. No console do Google: um projeto, a API
do Drive ligada, e um cliente OAuth de aplicativo instalado para o pacote
`app.norva.mobile`. A impressão digital SHA-1 do APK que você tem hoje é
`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` — chave de depuração,
que muda quando o app for publicado na loja; nesse dia o cliente ganha a segunda
impressão em vez de trocar.

**Nível de evidência, honesto:** **E3** para tudo o que não precisa de navegador —
a forma do pedido, a troca do código, a renovação, o multipart com os bytes
intactos, o 401 que vira uma segunda tentativa e não um laço, e a ordem da rodada
automática (16 provas em `src/nuvem/drive.test.ts`, `sozinho.test.ts` e
`pkce.test.ts`). **E1** para a tela de consentimento do Google e a volta dela ao
aplicativo: isso é navegador de verdade em aparelho de verdade, e quem prova é você.

Hoje o razão inteiro mora em `norva.db` no aparelho. **Aparelho quebrado, roubado
ou formatado = a fábrica sem histórico**, e não existe estorno para isso. Todas as
outras coisas desta fila atrasam funcionalidade; esta perde dado.

O dono levantou o Google Drive, e a ideia é boa — **com uma correção de ordem que
vale mais que a escolha do destino: o risco fecha antes do Drive.**

| passo | o que fecha | conta ou crédito que gasta |
|---|---|---|
| **0a. O arquivo** — `VACUUM INTO` num `.db` novo, e a restauração de volta | a prova de que existe cópia fiel e que ela volta | nenhum |
| **0b. A partilha** — `expo-sharing`, o dono manda o arquivo para onde quiser | **o risco de perder tudo, inteiro** | nenhum |
| **0c. O Drive automático** — entrar com Google, `appDataFolder`, sobe sozinho | o dono não precisa lembrar | OAuth do Google, de graça |

**`VACUUM INTO` é o achado que torna o 0a pequeno.** O banco do aparelho é um
arquivo de verdade (`src/data/db.ts:890`), e o SQLite tem uma instrução que escreve
uma cópia **consistente** dele num arquivo novo — sem parar o app, sem WAL pela
metade, sem serializador para escrever e manter. Provado nos dois lados: a cópia
leva os dados e leva o `PRAGMA user_version`, que é justamente o marcador que o
`migrate` já usa (`:954`). Então **um backup antigo se restaura sozinho**: o
aparelho abre a cópia, vê a versão, e roda as migrações que faltam. É a mesma
escada que já existe para um celular que ficou dois meses desligado.

**Nível de evidência, medido em 6 de setembro às 19h41 no emulador — E3.**

| a afirmação | nível | o que provou |
|---|---|---|
| a regra (grava, volta, recusa cópia nova, não esquece tabela, desfaz em órfão) | **E3** | `npx tsx --test src/data/backup.test.ts` — 7 provas contra SQLite de verdade |
| `VACUUM INTO` e `ATTACH` funcionarem **no aparelho** | **E3** | o toque no botão, e a tela respondendo *"Ela guarda 6 movimentos e pesa 320 kB"* |
| a cópia chegar num app que a receba | **E1** | a folha abriu vazia no emulador nu; em aparelho real depende do mimetype, que foi corrigido para `octet-stream` e **não foi visto funcionando** |

A terceira linha é o que falta, e ela é do dono: o APK no tablet dele, tocar em
*"Guardar uma cópia agora"*, e ver o WhatsApp aparecer na lista.

**E o emulador achou o que teste nenhum acharia**, que é a razão de a foto ser regra
aqui: o mimetype `application/vnd.sqlite3` faz o Android oferecer **nenhum**
aplicativo, porque quase nenhum declara aceitá-lo. A chamada é idêntica, a promessa
resolve igual, e o que muda é a lista montada do outro lado.

**E o 0b é o passo que fecha o risco, não o 0c.** Uma vez que o arquivo existe e
volta, mandá-lo para o WhatsApp do dono, para o e-mail ou para o Drive na mão é uma
folha de partilha do sistema — zero conta, zero crédito, funciona esta semana. O
Drive automático é conveniência em cima disso, e conveniência não é o que separa
uma fábrica com histórico de uma sem.

**Três coisas decididas aqui, para não virarem pergunta:**

1. **Backup não é sincronia, e confundir os dois é caro.** O Drive resolve *"o
   celular morreu"*. Ele **não** resolve *"dois celulares escrevendo na mesma
   fábrica"* — isso é o servidor, com `recorded_by` imposto por política e regra de
   conflito. Então o Drive **não adianta o servidor: ele torna seguro o servidor
   demorar**, que é exatamente a decisão escrita do dono (*"o servidor sobe o mais
   tarde possível"*).
2. **O destino é configuração da empresa (F7), e o primeiro construído é o Drive.**
   Nem todo dono tem ou quer conta Google, e o aplicativo vai para as duas lojas —
   quem está no iPhone espera iCloud. Chumbar Drive seria escolher por ele.
3. **O que vai no arquivo é o razão inteiro, com custo e fornecedor dentro.** No
   `appDataFolder` do Drive ele é privado ao aplicativo, e ainda assim: quem entra
   na conta Google do dono lê a margem da fábrica. A tela diz isso em uma linha
   antes do primeiro backup, e não depois.

### 1. ~~O extrato — uma tela que faz três trabalhos~~ — FEITO em 7 de setembro

<!-- medida: presente app/extrato.tsx :: ledgerExtract -->

O que estava medido aqui: **nove funções escrevem no livro-razão a partir de tela** e
**o caminho de volta era alcançável de duas** (`app/lots/[id].tsx:133` e
`app/inputs/[id].tsx:505`). A carga e a transferência gravavam sem botão de volta. A
fundação diz *"corrige-se por estorno, nunca por exclusão"*, e ela estava honrada no
banco e **inalcançável na mão de quem erra** — e o que uma pessoa faz numa fábrica
quando não dá para consertar é parar de registrar. Perde-se o dado, não o conserto.

**Fechado por `app/extrato.tsx`**, e a medida é esta: `ledgerExtract` agrupa por
`COALESCE(movement_group_id, id)`, então lista **qualquer** ato, venha ele de qual das
nove funções vier; o `Desfazer` é incondicional exceto nas duas exclusões corretas —
ato já desfeito, e o próprio estorno (`app/extrato.tsx:272`). A tela é alcançável de
dois lugares: a gaveta do *Mais* (`app/(tabs)/more.tsx:163`) e a ficha de uma loja
(`app/places.tsx:309`), que é o P1 satisfeito no mesmo commit.

**A régua da taxa congelada continua escrita, e ela é CONDICIONAL — vale no dia em que
o extrato somar.** Hoje ele não soma: cada ato mostra o seu valor e não há total, então
os dois números nunca aparecem lado a lado e não há o que reconciliar. A diferença está
explicada no docblock da tela (`app/extrato.tsx:55`). **Se um total entrar**, ele soma
taxa congelada linha por linha (`amountOf(unit_cost_rate, base_units)`) e por isso não
fecha com `stockByPlace`, que valoriza o saldo com o custo médio de hoje: os dois estão
certos e respondem perguntas diferentes, e a diferença tem de **aparecer na tela** com
o `[por quê?]` ao lado. Esconder com arredondamento conveniente seria produzir o
documento bonito, verde e falso que este repositório mais teme.

**E o nome dele é conferência, não prova.** No aparelho o razão não é append-only:
zero `TRIGGER` em `src/data/db.ts` contra três na `0001`, `erase.ts` apaga em bloco,
`recorded_by` foi removida na V5 e `device_id` nunca existiu. Um documento gerado no
celular **não tem signatário** — então ele assina *este aparelho, este operador,
esta data*. Documento para terceiro é do servidor, onde a política impõe quem
escreveu e o `UPDATE` levanta exceção.

### 2. ~~O caminho de escrita para o servidor~~ — CONSTRUÍDO em 8 de setembro

<!-- medida: presente app :: drain\( -->

`src/sync/transporte.ts` é a implementação de `Transport` que faltava, e Ajustes a
chama. O que estava atrás dela existia há dias — o motor com as três regras, a fila
append-only, o tradutor de colunas, a conta, e (desde 7 de setembro) a empresa
adotada.

**Três decisões de desenho, e as três têm razão escrita no arquivo:**

- **uma linha por vez, na ordem em que a fábrica gravou.** A fila é escrita em ordem
  de dependência; agrupar por tabela para mandar em lote reordenaria tudo e o
  servidor recusaria por chave estrangeira, com a fila presa atrás. O motor já manda
  em fatias de cem — dentro da fatia, a ordem é sagrada;
- **para no primeiro erro**, que é regra do motor: continuar depois de uma recusa
  mandaria linhas cujos pais o servidor não tem, e transformaria uma recusa em muitas;
- **enviar é um TOQUE, nunca automático.** *"Usar com sabedoria"* é decisão escrita do
  dono: o servidor é pago, a fábrica funciona inteira sem ele, e sincronia automática
  é dado saindo do aparelho sem ninguém ter decidido que saísse.

**E o nível de evidência é honesto: E3 para a forma, E1 para a viagem.** Cada coluna
que atravessa é exercitada contra um Postgres de verdade sob RLS pela checagem 6 do
`db:verify` — 84 escritas, entrando como a conta e não como superusuário. O que nunca
aconteceu é a chamada HTTP contra o servidor do dono: apontar para o projeto dele é
ato dele, num toque, e a tela diz isso antes.

### 2b. ~~O que trava o transporte, e é decisão de dono~~ — **DECIDIDO em 7 de setembro: existe Reset, e ele apaga**

<!-- medida: presente supabase/migrations :: create table erase_requests -->

**A resposta do dono não foi nenhuma das duas que eu ofereci.** Eu tinha posto uma
escolha entre *(A) limpar é só no telefone* e *(B) o servidor esquece sem apagar*, e ele
respondeu por fora das duas:

> *"coloca uma opção de Reset q passa por duas etapas de confirmações do usuário
> explicando isso do registro aí antes de apagar. aí fica a critério do usuário.
> obviamente q apenas o adm pode fazer isso."*

Ou seja: **apagar de verdade, com o usuário sabendo exatamente o que perde.** O que
carrega o peso é a TELA — duas confirmações, a segunda explicando o que o registro é —,
não uma proibição do banco. É a mesma forma da Lei 5 deste projeto: *erro se impede, não
se reclama* — aqui, o que impede é a pessoa entender antes, não o sistema recusar depois.

E é a mesma lição que a decisão do PIN já tinha dado: **eu ofereci duas opções e as duas
eram erradas.** A borda das perguntas do `CLAUDE.md` diz para perguntar qual é o PADRÃO,
não qual é o único — e eu apresentei um mundo de duas saídas construído a partir do que
eu tinha medido, não do que o produto precisa.

**O que está fixo e não se repergunta:** existe Reset · ele apaga · são duas
confirmações · a segunda explica o que se perde · só quem tem `manage_company` alcança.

**E um achado de olhos novos (Fable, 7 de setembro) que muda o desenho do Reset:** não
existe *"apagar só o exemplo"*. As áreas são por TIPO — apagar "compras" leva as compras
reais junto com as de exemplo, e cada cadastro real cria uma `purchase_line` que trava
"apagar insumos". O caminho seguro (desativar um a um) não é apontado em lugar nenhum.
É a saída **H** do estudo do erase — separar exemplo de dado real na origem — e ela
entra no desenho do Reset em vez de ser tratada à parte.

**A engenharia que faltava, com a forma escrita — 7 de setembro, noite.** Três perguntas
estavam abertas, e as três têm resposta medida:

**1. Como o servidor honra sem que a tranca recuse.** Não honra com `TRUNCATE`: ele é por
TABELA, e apagaria as outras empresas junto. Não honra por `delete from companies` esperando
o `on delete cascade`: apagamento em cascata **dispara gatilho de linha**, então o razão
recusa igual. E não honra com uma bandeira de sessão (`set_config`), porque `set_config` não
é privilegiado — qualquer conta autenticada a ligaria e o razão ficaria aberto para todo
mundo. O que resta, e é a única porta estreita: o gatilho passa a admitir a mutação quando
`current_user` é o **dono do banco** E a bandeira está posta. Cliente nenhum chega lá — a
conta do aplicativo é `authenticated` —, e quem chega é uma função `security definer` em
`private`, com `execute` revogado de `public`, `anon` e `authenticated`. A bandeira sozinha
não abre nada; o dono sozinho também não (uma migração distraída continua sendo recusada).

**2. O alcance continua por ÁREA**, porque é o que a tela já pergunta e o que o dono
confirma na segunda confirmação, com os números por extenso. "Empresa inteira" é a área
`all`, que já existe.

**3. Esvaziar, não aposentar.** Aposentar guardaria o livro de alguém que pediu para apagar —
é a saída B, que ele recusou por fora.

**O desenho, então:**

- `companies.erase_grace_days` — **10** de padrão (decisão dele), `0` destrói no ato, e
  **nulo** é *"nunca destrói no servidor"*. Os três casos que ele nomeou, um em cada valor;
- `erase_requests` — o PEDIDO, que é fato e não comando: empresa, área, quem pediu, quando, e
  quando vence. Só `insert` para o cliente (a mesma forma de `sale_price_history`), com
  `manage_company` e `requested_by = auth.uid()`; sem `update` e sem `delete`, porque pedido
  não se reescreve — desistir é outro pedido;
- `private.run_due_erases()` — o que EXECUTA, uma vez por pedido vencido, e marca o pedido
  como feito. É ela que abre a porta estreita do item 1, e só ela;
- o `serialize` deixa de mandar um comando solto e passa a inserir o pedido: assim a fila
  volta a carregar só FATO, que é a fundação dela.

**O prazo aparece na tela antes de vencer** — a mesma regra do prazo do entregador: *"avise
na data da decisão, não na data do problema"*. Enquanto o pedido não venceu, o dono vê
quanto falta e pode pedir o contrário.

**FEITO na mesma noite** — a `0045` traz as três peças e o `db:verify` ganhou duas
garantias que as exercitam contra um Postgres de verdade: o pedido é fato (sem `update` e
sem `delete`, e quem não administra não pede), o prazo é do servidor (um pedido que chega
com data no passado sai com os dez dias da empresa), e vencido ele destrói **só quem
pediu** — a vizinha fica intacta, o pedido fica marcado, e a porta fecha atrás: um
`delete` comum no razão volta a ser recusado, inclusive para o dono do banco, e a conta
do aplicativo não abre nada só pondo a bandeira.

E a fila deixou de carregar um comando: o apagamento sobe como **linha** em
`erase_requests`, com quem pediu e sem o prazo. Era a única coisa na fila que mandava em
vez de contar.

**E zerar antes do lançamento é outro ato, que não depende disto.** Provado contra um
Postgres com as 43 migrações: `DELETE` e `UPDATE` em `movements` são recusados até para
o dono; `TRUNCATE` passa, porque não dispara gatilho de linha. Zerar pelo console do
Supabase é `truncate`, nunca `delete`.

<details>
<summary>O achado original, que continua valendo como descrição do problema</summary>

**Achado em 7 de setembro indo construir o transporte.** As peças estão todas de pé —
o motor (`src/sync/engine.ts`) com as três regras e provado contra um `Transport`
falso, a fila (`src/data/outbox.ts`), o tradutor (`src/sync/serialize.ts`) e a conta
(`src/sync/conta.ts`). Falta **uma** implementação de `Transport` e quem a chame. Ao
escrever a primeira, ela bate numa parede.

O aparelho enfileira `{ table: 'erase', rowId: area }` quando alguém usa *"limpar por
área"* (`src/data/repository.ts:4204`), e o `serialize` transforma isso num comando
`{ kind: 'erase', area }`. **Não existe função no servidor que o receba** — nenhuma
migração das 43 declara uma. E ela não poderia apagar o razão nem se existisse: a
`0001` cria `movements_are_immutable` como `before update or delete on movements`, e
a checagem 1 do `db:verify` prova que os dois são recusados.

Ou seja: o primeiro transporte de verdade **trava no primeiro erase** — ou o descarta
em silêncio, e aí aparelho e servidor divergem para sempre sem ninguém saber.

**Duas saídas, e as duas são produto, não código:**

| | o que acontece | o preço |
|---|---|---|
| **A. "Começar do zero" é LOCAL, e ponto** | o aparelho volta a zero; o servidor guarda tudo; a sincronia seguinte devolve o que o servidor tem | "limpar" deixa de limpar de verdade quando há servidor — e a pessoa que limpou vê tudo voltar |
| **B. O erase é um MARCADOR, não um apagamento** | o servidor grava *"esta empresa pediu para esquecer a área X nesta data"* e para de devolver essas linhas; nada é apagado | uma migração nova, e o razão fica íntegro por baixo de uma tela limpa |

**A recomendação é B**, porque é a única que honra as duas fundações ao mesmo tempo:
o razão continua append-only, e *"começar do zero"* continua fazendo o que promete na
tela de quem apertou. É migração, então é P3 — entra com cuidado e não se edita depois.

~~**Isto está aqui e não na fila porque a resposta muda o que é construído**, e porque
o lado errado destrói dado num servidor. É uma das três bordas.~~ — **respondido acima.**

</details>

### 3. Ouvir o aplicativo — cinco minutos dele, zero meus

<!-- medida: espera :: cinco minutos de TalkBack no tablet do dono — nenhum comando escuta o app por ele -->

`src/acessivel.test.ts` prova que todo alvo de toque se anuncia. **Ninguém nunca
ouviu o aplicativo.** O dono levantou o cego por conta própria (*"até para quem eh
cego, imagina…"*), e o TalkBack é uma chave nos ajustes do tablet onde o APK já
está. É um E3 que eu não alcanço daqui e ele alcança hoje.

---

## O que eu removeria ou mudaria — e o dono mandou fazer

### 4. ~~Papel é o produto; Orgânico é opção~~ — FEITO em 6 de setembro

<!-- medida: presente src/home/capas/vestimenta.ts :: Record<Skin -->

Duas peles se pagam duas vezes em tudo: quinze cenas × 2, quatro paletas, e uma
guarda para mantê-las honestas. O preço já apareceu — **seis acentos do Orgânico
estão abaixo da régua de legibilidade** e vivem registrados como exceção em
`src/theme/contrast.test.ts` (o item 3c). **Seis exceções não é exceção, é padrão.**

Não remover: **hierarquizar.** Cena nova sai no Papel e o Orgânico segue depois, em
vez de um travar o outro — está escrito no `CLAUDE.md`, na decisão das peles.

**E os acentos foram consertados, não registrados: a lista de exceções da guarda
ficou VAZIA.** Eram oito e não seis — o `warning` do Papel também estava lá, e o
comentário do registro dizia "o PAPEL não está aqui" com ele na segunda linha do
conjunto. Os oito desceram pelo remédio que a própria guarda prescreve: matiz e
saturação intactos, só a luminosidade, e o cálculo achou o primeiro ponto em que
cada um passa. `apricot` de `#E29B52` a `#9D5C1A` — matiz 30 nos dois, saturação
71% e 72%, luminosidade de 60% para 36%. **É a mesma cor mais escura, e não outra
cor**, que era a dúvida que travava a decisão.

### 5. ~~O padrão da capa cai para ~5 peças~~ — FEITO, e são OITO

<!-- medida: presente src/domain/briefing.ts :: DEFAULT_OFF -->

O catálogo de dezesseis está certo e fica. Errada era a **porta de entrada**: empresa
nova recebia muita coisa, e quinze peças com posição e tamanho é uma tela de ajuste
que um dono de baixa habilidade técnica não abre.

**Feito, e são oito — não os ~5 que eu propus.** Ao aplicar, o número arredondado
brigou com a Lei da Inteligência e a Lei ganhou: o padrão leva o que **avisa** e o
que **decide**, e o que só **conta** espera alguém pedir. Ficam `producao`,
`semana`, `aoVivo`, `cobertura`, `validade`, `entregaHoje`, `clima` e `copia`. Saem
oito, e todas por serem relatório.

*Este parágrafo disse "sete" por um dia inteiro contando só as sete que eu tinha
escolhido à mão: `copia` entrou depois, pelo outro lado da conta — ela não está no
`DEFAULT_OFF`, logo está no padrão. O número certo é dezesseis menos oito, e não a
lista que eu lembrava. `copia` só se mostra quando a cópia está atrasada, o que é o
motivo de ela não aparecer numa foto e de eu não a ter contado.*

**`cobertura` e `validade` não desceram, e é aí que os ~5 morreram:** peça que avisa
e que ninguém ligou é aviso que não existe — uma fábrica que nunca abre Ajustes
nunca descobriria que tem lote vencendo. Cortar um aviso para chegar num número
redondo seria servir a minha frase em vez de servir a tela.

### 6. ~~O assistente congela até o áudio existir~~ — CONGELADO em 6 de setembro

<!-- medida: ausente src :: expo-speech -->

1142 linhas em `src/assistant/skills.ts`, monolíngue por decisão escrita no topo do
`index.ts`, 791 de teste. Com o modo conversa e o áudio aprovados (§ *As seis*, item
4), a forma muda: a entrada deixa de ser caixa de texto e a resposta deixa de ser
parágrafo. Investir ali este mês é construir para jogar fora, e jogar fora custa
duas vezes — a construção e a coragem de apagar.

**Congelado, e está escrito no topo do `src/assistant/index.ts`**, ao lado do
raciocínio que já explicava o monolinguismo. Nada foi removido: o que congela é
habilidade nova e tradução das respostas. Conserto de defeito e o `[por quê?]`
continuam valendo sem prazo, porque essa parte não é do casador — é da doutrina.

### 7. ~~O que é espera sai da lista de serviço~~ — FEITO, veja *Espera aparelho* acima

<!-- medida: espera :: a lista de espera é prosa deste arquivo; não existe código que a represente, e é essa a intenção -->

Alguns itens abertos estão travados em observação — a frase do portão P2, *"eu
mudaria isto se eu visse ___"*. Isso não é trabalho, é espera, e carregar espera
junto com serviço **faz a lista mentir sobre quanto dela é acionável**. Vão para uma
seção própria, **"espera aparelho"**, e o que ficar na fila é tudo fazível hoje.

### ~~A pergunta que mais decide o que o app consegue afirmar~~ — `sale` TEM escritor, desde 8 de setembro

<!-- medida: presente src/data/repository.ts :: 'sale' -->

**Achada em 7 de setembro construindo o "produza até", fechada em 8.** O tipo `sale`
existia no razão desde a fundação e **nenhuma tela o escrevia**: o aplicativo sabia o
que saiu da FÁBRICA e não sabia o que saiu para o CONSUMIDOR. A carga saía, chegava na
loja, e ali o razão parava.

Três coisas dependiam disso: o Espelho da Loja não tinha como calibrar (sem venda, o
que ficou na prateleira e o que vendeu eram a mesma coisa para ele), a cobertura da
empresa era infinita para produto, e **margem não existia** — o custo congelado o razão
tem, o preço combinado também, e o que faltava entre os dois era o fato da venda.

**Quem escreve é a CONTAGEM, e isto é o padrão, não o único caminho.** Duas respostas
eram possíveis, e elas são produtos diferentes:

| caminho | o que custa | o que dá |
|---|---|---|
| **A loja registra cada venda** | um PDV — aparelho, tela de venda, pessoa treinada | a venda no instante em que acontece |
| **A contagem periódica deduz** ← **o padrão** | quase nada: a contagem cega **já existia** e já virava movimento | a venda do período, com a diferença explicada |

O padrão é o segundo porque é o que uma fábrica de seis pessoas aguenta e porque cabe
inteiro no que já estava de pé. O primeiro entra depois como configuração de quem o
quiser, com a contagem seguindo como conferência em cima dele — é a regra da casa:
*"depende de quem usa"* vira configuração, e o que se decide é o padrão.

**Como funciona, em uma frase:** numa loja própria (`RETAIL_PLACE_KINDS`), o que a
contagem encontra de FALTA foi comprado por alguém — entra como `sale`, com o preço
combinado daquela loja congelado em `movements.unit_price_rate` ao lado do custo. Sobra
positiva continua `adjustment`: não se desvende picolé. E a ordem na loja é *lança a
perda primeiro, conta depois* — a perda tem tela própria e motivo obrigatório, e o que
resta de falta é a venda, sem o aplicativo ter de adivinhar a diferença.

O que entrou: `RETAIL_PLACE_KINDS`/`vendeAoConsumidor` (`src/domain/ledger.ts`), a
coluna `unit_price_rate` no aparelho (`V26`; o servidor a tem desde a `0008`) e na fila
(`src/sync/serialize.ts`), `recordCount` decidindo a espécie pela do lugar, e a
confirmação da contagem falando de receita em vez de custo nos três idiomas.

**O que o PDV vai ter de carregar quando chegar** — dito aqui para não virar defeito
silencioso: hoje `app/inputs/[id].tsx` responde *"conferido em"* aceitando `adjustment`
**ou** `sale`, o que é verdade porque toda venda nasce de uma contagem. Uma venda de
PDV não prova que alguém andou até a prateleira, então o item do PDV entra junto com um
marcador de origem no movimento. Sem ele, o *"conferido em"* de toda loja passa a
mentir para cima.

### Espera aparelho — o que NÃO é serviço, e por isso sai da fila

<!-- medida: espera :: fábrica de verdade usando o app: ergonomia de luva, QR a um braço, calibração de devolução e de prazo -->

Estes não estão pendentes: estão **esperando alguém usar**. Carregar espera junto
com serviço faz a lista mentir sobre quanto dela é acionável, e a lista existe para
responder *"qual é a próxima"* — não para parecer cheia.

Cada linha diz **o que a tira daqui**. Espera sem condição de saída é espera para
sempre, com outro nome.

| o que espera | por que não se decide de dentro | o que a tira daqui |
|---|---|---|
| **A régua do "devolve demais"** do Espelho da Loja | não existe em lugar nenhum do código, e qualquer número que eu escolhesse seria invenção: 10% de devolução é ótimo numa loja de bairro e alarme num supermercado | um mês de movimento real numa loja, e a comparação de duas |
| **A calibração das compras inteligentes** | o prazo do fornecedor é observado, não declarado — e a média de zero entregas não é média | o `ordered_at` sendo escrito (isso **é** serviço, e está na fila) e depois algumas semanas de compra |
| **A ergonomia a -18 °C** | tela capacitiva com luva, QR a um braço de distância, dedo molhado. Nada disso é visível de dentro de um módulo nem de uma foto de emulador | o aparelho dentro da câmara fria, com alguém de luva |
| **A conta em E3** | entrar de verdade cria uma conta de autenticação no projeto do dono, e isso é decisão dele — não minha e não do código | uma decisão de uma linha: posso criar uma conta de teste |
| **Ouvir o aplicativo** | `src/acessivel.test.ts` prova que todo alvo se anuncia; ninguém nunca **ouviu**. Eu não alcanço o TalkBack daqui | cinco minutos dele no tablet, com o TalkBack ligado |
| **A conferência cega NA DOCA** | duas posições escritas discordam, e as duas têm razão: um formulário por item ninguém preenche de luva, e o esperado na tela faz a pessoa confirmar sem contar. A contagem do item já é cega; a chegada da carga não | ele ver uma conferência de carga acontecendo — ou dizer que o padrão passa a ser perguntar quantas caixas chegaram |

E a lição que essa separação carrega, porque ela já custou uma rodada: **o P2 não é
uma afirmação sobre o mundo, é uma pergunta.** Eu travei o refluxo em tablet
respondendo sozinho *"ninguém usa tablet"*, e o dono tinha um. Antes de pôr um item
aqui, a checagem é se quem observa não está do outro lado da conversa.

### 8. Feito nesta noite — as duas que eram conserto e não escolha

- **Um ponto de arredondamento, não dois.** `amountOf` diz de si *"the one place
  rounding happens"*, e `repository.ts` — que o importa na primeira linha — chamava
  `cents(rate * qty)` em dois lugares, cada um com o comentário *"arredondada aqui e
  só aqui"*. Três declarações de unicidade, dois autores de fato, e verdes porque
  hoje dão o mesmo número. Os dois passaram por `amountOf`.
- **A data do estorno virou regra escrita.** `reverseGroup` já datava em hoje, então
  estornar em outubro um erro de março não mexia no março que alguém já leu — o
  fechamento de período estável **de graça e por acidente**, sem comentário e sem
  teste. Agora o docblock diz por quê e o teste prende as duas pontas: o padrão cai
  em hoje, e a data explícita continua obedecida, que é como a sincronia reproduz um
  estorno de outro aparelho.

## A ORDEM — revista em 6 de setembro, com as decisões do dono

A pergunta dele foi direta: *"o roadmap completo já foi feito, confere? sem ele nao faz
sentido a gente sair fazendo as coisas pq vira bagunça."* Confere agora, e a ordem
abaixo respeita duas decisões escritas dele — *"termina o layout, nada pela metade"* e
*"depois do layout, o login/conta é o próximo, e ele pede estudo antes de código"*.

| | o quê | por que nesta posição |
|---|---|---|
| **1** | ~~**Refluir em colunas no tablet**~~ **— fechado, e o APK JÁ FOI ABERTO no tablet dele em 6 de setembro.** | as peças pareiam, o `Inteiro` interrompe, as abas se juntam e o pé das colunas ficou nivelado (`src/components/colunas.ts`). O que ele viu ao abrir não foi o layout: foi a cena parada e a cor apagada — que viraram o 3b.  <!-- medida: presente src/components/colunas.ts :: export function distribuir --> |
| **2** | ~~**A camada 1 do login depende do servidor**~~ **— DESTRAVADO e FEITO, e este item ficou dizendo TRAVADO por um dia inteiro com a saída já no disco.** <!-- medida: presente supabase/migrations :: references people\(id\) --> | O nó era `movements.operator_id` referenciar `memberships(id)`, e `memberships.user_id` ser `not null references auth.users`: o aparelho não pode criar conta de autenticação, logo não podia nomear ninguém. A saída não era nenhuma das três do estudo — foi a quarta, e é a decisão escrita no `CLAUDE.md`: **pessoa não é conta.** A `0035` derruba a chave e reaponta `operator_id` para `people(id)` (aparelho `V20`), a `0036` guarda o PIN, `app/who.tsx` é a grade de nomes e `app/_layout.tsx` manda para ela quando a empresa liga o aparelho compartilhado. Os sete `INSERT INTO movements` gravam quem estava com o aparelho, e `src/layers.test.ts` reprova o oitavo que não gravar. |
| **2b** | **A conta da empresa — a camada 2.** ~~O servidor não subiu~~ **— SUBIU**, e ~~falta o cliente, sessão, cadastro do dono~~ **— FEITO em 6 de setembro** (`src/sync/conta.ts`, `app/account.tsx`, porta em *Mais*). A porta fica nos Ajustes e não na frente do aplicativo: a fábrica offline é o caso normal. ~~**Falta o convite por código**~~ **— FEITO** (`0041` carimba um código em toda empresa, `src/sync/conta.ts` pede associação por ele), e falta o que só um login de verdade prova. <!-- medida: presente src/sync/conta.ts :: join_code --> | **Nível de evidência: E1.** Compila, passa o `npm test` e as guardas de tom e de camada — e **nada disso foi exercitado contra o servidor**, porque entrar de verdade cria uma conta de autenticação no projeto do dono e essa é decisão dele. O que falta para E3 é um `entrar` real: sessão guardada, `create_company_for_me` chamada, e a `companies_read` filtrando por associação. |
| **2c** | **O que não esbarra nisso** | ~~o motivo da devolução~~ **FEITO em 6 de setembro** (`return_reason`, aparelho `V19` e servidor `0034`, com a catorzena garantia do `db:verify` cobrando as duas metades da regra). ~~A **tela de conferir item a item**~~ fechou com a separação (`app/picking.tsx`, engradado a engradado, com a lista guardada por loja). ~~E o **preço combinado**~~ entrou em 6 de setembro (`0037` / `V22`), com histórico append-only ao lado — e o que ele destravou não é um campo: é a descoberta de que o aplicativo não tinha a quem vender. **O 2c está vazio.**  <!-- medida: presente src/data/db.ts :: return_reason --> |
| **3** | ~~**Espelho da Loja — construir**~~ **— FEITO em 6 de setembro** | `storeMirror` (`src/data/repository.ts`) e `app/mirror.tsx`, com a porta em Relatórios. A fração é por ITEM e não por loja, e isso é conserto de uma aritmética inválida que a primeira versão tinha: o razão conta em grama para o açúcar e em unidade para o picolé, e somar as duas afogava o item leve. Falta a calibração, que é o que precisa de fábrica — não há régua de "devolve demais" em lugar nenhum do código.  <!-- medida: presente app/mirror.tsx :: storeMirror --> |
| **3b** | ~~**A vida do aplicativo**~~ **— FEITO em 6 de setembro, e cobrado pelo dono** | *"o app tem q ser uma obra de arte… vc já viu organismo vivo MORTO?"*. A amplitude central subiu (`src/theme/tokens.ts`), as dezenove cenas de cabeçalho existem (`src/components/cenas/`) e as 27 telas que usam o casco estão vestidas, a semana e o pote respiram, o bloco do tempo veste a pele, e a capa aceita meia coluna (`briefingFilas`, com teste). O estilo tem nome gravado: `docs/design/estilo.md`.  <!-- medida: presente src/components/cenas/prancha.ts :: export const CENAS --> |
| **3c** | ~~**Os acentos do Orgânico abaixo da régua**~~ **— FECHADO em 7 de setembro, e não por decisão: por consequência.** <!-- medida: ausente src/theme/contrast.test.ts :: ABAIXO_DA_REGUA = new Set<string>\(\[$ --> | Eram oito, não seis, e a lista de exceções hoje está **vazia**. Não foram consertados por escolha de cor: o chão do Orgânico precisou escurecer (o cartão branco só existia pela sombra), e a régua de 4,5:1 desceu os onze acentos junto, matiz e saturação intactas. Medido depois: o pior fica em **4,61:1**, e a paleta não tem folga — mexer no chão de novo derruba os onze de uma vez, e é o `contrast.test.ts` que avisa. |
| **3d** | ~~**As quatro peças da capa que NAVEGAM em vez de abrir**~~ **— FEITO em 6 de setembro** | virou a `Porta` (`src/home/Capa.tsx`): o toque e o aviso do toque são a mesma peça, então não dá para acrescentar uma quinta porta sem o rótulo.  <!-- medida: presente src/home/Capa.tsx :: function Porta --> |
| **4** | ~~**Os sete médios**~~ **— ACABARAM em 6 de setembro** <!-- medida: presente src/data/configuracao.ts :: orders_need_approval --> | `unchecked` foi removida, `lastCostMove` ganhou tela na capa, e a aprovação de pedido — a única que não era trabalho e sim bloqueio — destravou quando a linha de `companies` passou a existir: `src/data/configuracao.ts` faz as quatro configurações da empresa atravessarem. Não sobrou nenhum. |
| **5** | ~~**De onde a produção consome**~~ | **FECHADO em 8 de setembro, e nas duas metades.** O padrão foi decidido sob defeito — a tela lia a unidade, a escrita conferia uma sala, e nenhuma corrida rodava com a polpa na câmara — e é a unidade, com o consumo saindo da sala que tinha o insumo. A outra metade, que é o que a regra da casa exige, entrou junto: `consumoDaProducao` é configuração da empresa, a escrita e a tela perguntam à MESMA função, e a guarda passou a exigir a fonte comum em vez da palavra.  <!-- medida: presente src/data/repository.ts :: escopoDoConsumo --> |
| **6** | **Compras inteligentes** | mesma classe do 3 — construir agora, calibrar depois. ~~O primeiro passo era a data do pedido, porque `ordered_at` não tinha escritor~~ — **ele tem, desde 6 de setembro** (`app/purchase.tsx:578`), e com um desenho honesto: sem resposta nada é gravado, porque lacuna vazia é mais honesta que palpite. O que falta agora não é código, é **tempo**: `observedLeadTimeDays` precisa de entregas observadas, e isso é a linha *"calibração das compras"* da espera.  <!-- medida: espera :: entregas observadas numa fábrica de verdade para calibrar o prazo --> |
| — | **O fiscal** | fora, e o único que trava por algo que nenhum dado resolve: certificado A1 e homologação na SEFAZ. |

De pé, nesta ordem e por este motivo:

1. **Os médios que sobraram** — e onde eles estão escritos, que era a parte que
   faltava. O roadmap mandava nos *"sete médios"* e só um estava nomeado; os outros
   moram na **tabela 11.5 do `docs/DOSSIE.md`** ("Mapa completo das leituras"), com
   `X` = sem chamador de tela e `Z` = sem chamador nenhum. Uma varredura de 6 de
   setembro sobre as 95 exportações de `src/data/repository.ts` reproduziu a tabela e
   fechou as duas que restavam ali:
   ~~`unchecked`~~ **removida** — duplicata exata de `shipmentsOn`, que já responde a
   mesma pergunta com a mesma regra e tem tela; e ~~`lastCostMove`~~ **ganhou tela**,
   que era o conserto certo: ela responde *"estável há N dias"*, o dicionário já tinha
   `stableFor`/`stableAlways`/`allSteady` nos três idiomas sem escritor, e a capa
   mostrava o cartão de preço só quando algo mexia — a fábrica com o custo firme via a
   mesma capa de quem instalou ontem.
   Caíram antes: o `versionCode`, o `recorded_by` cedível, o percentual com ponto, o
   ícone de picolé, **a tela de abertura** e **a fila que nunca era varrida**.
   Fica de pé: a aprovação de pedido, que **não é trabalho, é bloqueio** — ver abaixo.

   *E a varredura virou GUARDA, para não precisar acontecer de novo.* A de "toda função
   exportada tem chamador ou razão escrita" (`src/layers.test.ts`) olhava só
   `src/domain`; passou a ler o `src` inteiro, e no mesmo dia isso tirou sete
   exportações mortas fora do domínio — um ponto de extensão do assistente que nada
   estende, três ícones substituídos pelos glifos (com o docblock do arquivo afirmando
   o contrário) e dois formatadores. Ficaram registradas `__setOpener` (gancho de
   teste) e `drain`/`serialize` (o motor de sincronia, sem chamador porque o servidor
   não subiu). **Daqui em diante a próxima morta reprova sozinha.**

   *E ela está MEDIDA, em 6 de setembro — não é "falta escrever", é bloqueada.*
   A aprovação existe inteira no aparelho: `setOrdersNeedApproval`
   grava a bandeira no `meta`, `saveOrder` nasce `pending` por causa dela, e
   `setOrderStatus` enfileira a decisão. *(As três âncoras `arquivo:linha` que este
   parágrafo trazia apontavam para outro código em 7 de setembro — número de linha em
   arquivo de seis mil linhas envelhece a cada commit, e a regra do plano pede
   `arquivo:linha`. O nome da função não envelhece; ele fica.)*
   O que não existe é a bandeira ATRAVESSAR: `meta` não é tabela de sincronia — não
   há uma entrada `companies` em `src/sync/serialize.ts` —, e o gatilho
   `order_starts_where_the_company_says` (`supabase/migrations/0019_an_order_is_demand.sql:103`)
   lê `companies.orders_need_approval` **no servidor**, que ninguém nunca escreveu.
   Resultado no dia em que a sincronia subir: a empresa liga a aprovação, o aparelho
   grava `pending`, e o servidor reescreve para `open` na inserção. A aprovação vira
   decoração — e o gatilho está certo, porque a regra não pode morar no aplicativo
   quando o pedido vem de fora.
   ~~**Ela é do item 2b**~~ **— DESTRAVOU e FECHOU em 6 de setembro.** O 2b subiu, a
   linha de `companies` passou a existir, e `src/data/configuracao.ts` faz as três
   configurações da empresa atravessarem: quem muda empurra, quem entra puxa. Não é a
   fila de propósito — a fila carrega fato e é append-only; configuração é preferência,
   e a última palavra vale.

   *E `forgetSentBefore` fechou junto, em 6 de setembro.* A auditoria dizia "sem
   chamador fora de teste" e estava certa — mas o conserto não era apagar: o motor
   de sincronia mandava e **nunca varria**, então no dia em que a sincronia existir
   o celular de uma fábrica movimentada carregaria um ano de linhas já entregues,
   que é exatamente o que o docblock da função diz que não pode acontecer. Agora o
   `drain` faz a faxina no fim, com janela de sete dias — e o `now` do `SyncOptions`,
   que também estava declarado e sem uso, ganhou o primeiro chamador nela.
   O teste ficou VERMELHO com a faxina comentada antes de virar verde: a primeira
   versão dele media `pendingCount()`, que conta o marcar e não o varrer, e passava
   com o defeito na frente.

   *A abertura fechou em 6 de setembro, e o achado não era o que parecia:* a marca
   dela **já era gerada** pelo `scripts/icons.mjs` e o `app.json` nunca a citou —
   arquivo desenhado com cuidado e jogado fora, que é o P1 numa forma que o P1 não
   pega, porque o citador é um JSON. Agora está configurada nas duas luzes (o
   `expo-splash-screen` não recolore: o escuro pede o próprio arquivo) e só sai
   quando a cara escolhida já foi lida do disco, para não haver um flash branco entre
   uma abertura carvão e uma página carvão. `src/marca.test.ts` cobra a ponte.
   **Evidência E2:** as imagens foram olhadas, o contrato foi lido, a barra está
   verde — a abertura em si só se julga num build de release, e a própria Expo diz
   isso desde a SDK 52.

2. ~~**A embalagem digitada é um `Rate`, e está guardada como `Cents`.**~~ **FEITO em
   6 de setembro.** `products.unit_packaging_rate` (aparelho `V18`, servidor `0033`),
   a coluna antiga dormente e declarada em `src/sync/columns.test.ts`, as duas metades
   do cálculo agora são taxas com a procedência preservada, e a tela mostra
   **R$ 0,004** de volta em vez de R$ 0,00 (`formatUnitRate`). Provado nos dois
   sentidos: o guarda do custo congelado fica vermelho quando o arredondamento volta,
   e as 33 migrações aplicam contra Postgres com as treze garantias de pé.

   *De quebra, a metade LISTADA da embalagem já tinha o mesmo defeito na tela*:
   `formatMoney(Math.round(itemsRate))` — um palito de meio centavo aparecia como
   R$ 0,00 desde que a lista existe. Só apareceu porque a mudança de tipo obrigou a
   olhar as duas.

### De onde a produção consome — FECHADO em 8 de setembro, nas duas metades

<!-- medida: presente src/data/repository.ts :: escopoDoConsumo -->

**Esta seção se chamava "A sala do tacho" e descrevia o comportamento errado como se
fosse o de hoje.** Duas coisas a derrubaram no mesmo dia, e as duas vieram do dono:

1. **A palavra saiu.** *"Que droga é essa de tacho?!"* — o termo é de indústria de
   sorvete e o aplicativo vai para as duas lojas. O nome da seção era jargão, e a
   pergunta que eu fiz a ele usando o termo era pior: ela pedia decisão sobre uma coisa
   que o código já decidia, de dois jeitos contraditórios.

2. **Não havia dois mundos legítimos: havia um mundo quebrado.** A tela lia o piso da
   UNIDADE (câmara fria e almoxarifado incluídos) e `recordProduction` conferia UMA
   sala. Com a polpa na câmara — que é onde polpa mora — a tela liberava o botão e a
   escrita recusava os seis insumos com erro de programador em inglês. **Nenhuma corrida
   rodava**, e a tela ainda dizia em que sala a polpa estava.

**O padrão passou a ser "salas da unidade somadas"**, e a régua é *"dá para ir buscar a
pé"*: a câmara fica a três metros e conta, a loja fica a dez quilômetros e não conta, a
fábrica da outra cidade não é uma caminhada. O consumo sai da sala que **tinha** o
insumo — uma linha por (insumo, sala), a sala da corrida primeiro e depois as outras por
nome —, então o saldo de cada sala continua sendo o que alguém encontra na prateleira.

**Isto foi decisão minha, tomada sob um defeito, e está dito em vez de escondido.** A
alternativa era estreitar a tela para uma sala, e esta mesma seção já escrevia por que
ela não serve: obrigaria a lançar transferência antes de cada corrida, e *"nenhuma
fábrica de seis pessoas"* faz isso. Fixar o padrão sem perguntar é o que a casa manda
quando não há escolha real; **o que a casa também manda é que os dois caminhos
existam**, e é aí que este item continua aberto.

**O que falta, e por isso o item não fechou:**

- ~~**A "sala estrita" como CONFIGURAÇÃO.**~~ **FEITA na mesma noite.**
  `consumoDaProducao` é a régua, e as duas pontas perguntam a ela: `recordProduction`
  monta o `escopoDoConsumo` com a resposta, e `app/production/new.tsx` lê a mesma coisa
  para decidir o que mostrar. O cartão em Ajustes só aparece com mais de uma sala nossa
  — com uma só os dois mundos dão o mesmo resultado, e a Lei 1 proíbe perguntar.

  **E a guarda mudou de forma junto com a regra.** Ela comparava a PALAVRA dos dois
  lados; com a resposta virando dado, a palavra literal saiu do corpo da escrita e ela
  passou a acusar a tela consertada — o pior jeito de uma guarda falhar. Agora ela
  reconhece o caso configurado e exige a FONTE comum: quem produz tem de perguntar à
  mesma função que a escrita pergunta.
- ~~**A transferência entre salas nossas**~~ — **FEITA em 8 de setembro.** E a nota
  anterior estava meio errada, o que só apareceu ao medir: a câmara fria já podia
  **receber** (ela sempre esteve na lista de destinos). O que faltava era **sair** dela
  sem que isso virasse `return` — notícia sobre uma loja, não sobre a nossa câmara. A
  ponta nossa deixou de ser a unidade constante e virou escolha entre
  `INTERNAL_PLACE_KINDS`, com a pergunta aparecendo só quando existe mais de uma sala
  (Lei 1). Com isso a sala estrita deixou de ser inviável na prática.
- **A ordem de debitar por VALIDADE**, não por proximidade. Hoje é a sala da corrida
  primeiro; o certo, quando o insumo tem lote, é o mais velho primeiro — que é o que o
  lote do produto já faz. É PEPS de insumo, e continua sendo trabalho da F3.

## A entrada — estudada em 6 de setembro, com o desenho decidido

O estudo está em **`docs/estudo-entrada.md`**, escrito depois de medir e não antes. O que
ele conclui, curto:

- **A fábrica já pode ser sempre offline** — a grade de nomes com PIN não depende de nada
  que não exista. O PIN é **atribuição**, não senha, e a tela deve dizer isso.
- **O servidor confere a CONTA, não o perfil da pessoa.** `movements_append` exige
  `recorded_by = auth.uid()` e `has_capability` da conta
  (`supabase/migrations/0008_ledger_speaks_phase_one.sql:26-41`). `profiles.capabilities`
  é camada do aparelho. Logo o teto do entregador tem que estar numa **conta por perfil**
  — que é o que a `0014` já dizia e eu tinha lido errado.
- **"Sempre offline" de verdade exige chave no aparelho e assinatura**, e portanto
  `expo-crypto`, `expo-secure-store` e uma biblioteca de assinatura — nenhuma existe. E
  exige alguém que confira, que hoje não existe: a política olha `auth.uid()`. Não se
  constrói antes do canal.
- **Revogar não tem solução offline.** O que dá é diminuir o estrago e fazer
  `devices.active` valer — hoje o servidor **não confere `device_id` em nada**.

**A ordem que saiu do estudo:** grade com PIN → `operator_id` ganha escritor → servidor
confere aparelho → conta por perfil e código de convite (quando o servidor subir) → chave
e assinatura (só se alguém pedir).

### O portão do dinheiro no aparelho — FEITO em 6 de setembro

Havia uma decisão escrita do dono sem código atrás dela: *"aparelho emprestado entra
como produção e nada mais. Celular da empresa passa de mão; quem está com ele usa o
papel `operator` — sem custo, sem preço, sem dinheiro."* O aparelho não tinha como
obedecer, e `app/assistant.tsx` dizia por escrito por quê: *"until sign-in lands,
whoever holds this phone is the owner"*. **A fronteira era verdadeira quando foi
escrita e deixou de ser** — a grade de nomes existe desde ontem, `people.profile_id`
aponta para um perfil, e o perfil carrega as capacidades. Ela esperava a CONTA, e o
que faltava era a PESSOA.

Agora `currentCapabilities` responde, e **dez leituras de dinheiro perguntam antes
de consultar**: `listItems`, `itemCosts`, `stockByPlace`, `lossesOn`, `recentRuns`,
`recentCostChanges`, `itemHistory`, `itemMovements`, `ledgerExtract` e a embalagem
digitada de `listProducts`. *(Eram oito quando isto foi escrito; o extrato ganhou o
portão depois e ninguém voltou aqui.)* O portão fechado não apaga o número depois de lê-lo — ele não junta a
tabela de custo, que é a mesma forma da view do servidor (`0008`).

**Treze telas distinguem três estados** onde antes havia dois: tem número · ainda não
tem custo (lance a nota) · não é seu para ver. Zero respondia os dois últimos com o
primeiro, e a tela de insumos escrevia em âmbar *"12 itens sem preço — lance a nota"*
para um almoxarifado inteiramente precificado (`null <= 0` é TRUE em JavaScript).

**O que a verificação adversarial achou, e ela salvou a mudança.** Duas refutações
independentes mediram, rodando o código, que o portão que eu tinha acabado de
escrever ENVENENAVA O LIVRO-RAZÃO: `recordProduction` e `recordLoss` leem as taxas
por `itemCosts`, e com o portão fechado a corrida congelava `unit_cost_rate` nulo em
cada consumo e **5 onde o dono congelava 304,98** — sobrando só a embalagem. Pior, a
contaminação não ficava nas duas: `item_costs` é reescrito a partir do que elas
gravam, então transferência e contagem, que estão certas, passavam a congelar
fielmente o número errado; e o servidor recalcula pela mesma coluna (`0025`),
concorda, e a checagem de divergência do `db:verify` PASSA. Conteúdo de livro-razão
não se corrige: se estorna.

O conserto é a convenção `ForLedger` — `averageRatesForLedger` e
`listProductsForLedger`, sem portão, para quem GRAVA. Congelar custo e ver custo são
perguntas diferentes, e só a segunda tem portão. `src/layers.test.ts` recusa qualquer
arquivo fora de `src/data/` e `scripts/` que as mencione, porque os docblocks já
afirmavam esse guarda antes de ele existir — e docblock que promete uma rede que não
está lá é pior que docblock nenhum.

*E "qualquer arquivo" era metade dos arquivos até 7 de setembro.* O coletor da guarda
descarta `*.test.ts`, o que está certo para quase toda regra de camada — teste que
FALA de SQL não é tela que FAZ SQL — e está errado para esta, que é sobre quem CHAMA.
Havia um chamador de verdade lá dentro: `src/notify/facts.test.ts`, em quatro linhas.
Agora os testes são varridos também, e esse fica dispensado com a razão escrita ao
lado. É o vizinho da propriedade de novo: a guarda media uma coisa parecida com a que
prometia.

**Três testes novos, e a ordem entre eles é o achado:** o *gêmeo* grava produção,
compra, perda, contagem e transferência duas vezes — dono e operador — e afirma que
`unit_cost_rate` de cada linha é IGUAL, número por número; o *de mão única* prova que
nenhuma das oito leituras devolve dinheiro para quem não pode ver; e o do *piso*
prova as duas bandeiras do aparelho compartilhado. O de mão única sozinho passaria
com o razão apodrecido — foi exatamente o que faltou.

**O que fica de pé, dito por extenso:**

- **O portão está DORMENTE no padrão.** Ele só acorda quando a empresa marca
  `shared` **e** liga "Nomear quem gravou": sem isso ninguém é escolhido e o
  aparelho é do dono, como sempre foi. A fábrica que mais precisa dele é a que o
  liga.
- **Não é autenticação, e nada aqui finge que é.** A grade não pede senha, o PIN tem
  de quatro a oito dígitos e é opcional, e qualquer um pode tocar no nome do dono. O que o
  portão compra é o que o `access.ts` diz querer comprar: tirar a margem da vista de
  quem está embalando. Quem impõe de verdade é o servidor, e ele já impõe.
- **A aba Relatórios fica com um cartão só** para quem não vê dinheiro — os três
  cartões dela são dinheiro. As portas continuam lá (`/losses` só é alcançável por
  ali), mas responder as três perguntas da Lei da Inteligência em FATO — perdas por
  contagem, conferências da semana, corridas por unidade — é superfície nova e é
  decisão de faseamento do dono.
- **"O que falta para 3 tachos" continua recusado ao operador**, e é decisão
  escrita: a lista de compras tem rota `/purchase`, e comprar é ato de quem cuida do
  dinheiro. O atrito é real — também é pergunta de quem produz — e a saída, se o
  dono quiser, é a mesma conta sem a lista de compras.
- **A tela de gente ganhou portão de verdade** (`manage_company` conferido em
  `savePerson`, antes da escrita): sem ele, trocar o próprio crachá para "Dono" era
  a porta dos fundos de todo o resto.

### O preço de venda não é um campo que falta: é uma peça inteira que nunca existiu

Medido em 6 de setembro, ao ir construir *"o preço combinado na ficha da loja"* que
esta lista pedia. Três coisas que pareciam separadas são a MESMA falta:

| o que existe | desde | quem escreve |
|---|---|---|
| `movement_kind` tem `sale` — *"sold to a customer (revenue + margin)"* | `0001` | **ninguém** |
| `movements.unit_price_rate`, gateada por `view_sale_price` na view | `0008` | **ninguém** |
| `location_kind` tem `customer`, e a tela desenha o glifo e o rótulo dele | `0001` | ~~só a simulação~~ **a tela também, desde 6 de setembro** |

E a terceira linha é a pior das três, porque só a FOTO a mostrou. `app/places.tsx`
oferecia três espécies no cadastro — `own_store`, `cold_room`, `store_room` —, todas
NOSSAS. **Hoje oferece as quatro, com `customer` junto, e este parágrafo ficou no
passado sem ninguém voltar aqui.** Mas a fábrica de exemplo cria um cliente (`src/data/simulate.ts:130`, "Mercado
do Zé"), e a tela o desenha certinho, com o glifo e a sobrelinha "CLIENTE". **A
simulação mostra ao dono uma coisa que o aplicativo dele não sabe fazer** — é a mesma
família da ferramenta de olhar que mente sobre o que está olhando, e nenhum teste vê:
o dado semeado e o formulário são dois autores diferentes da mesma lista.

E o docblock do `moveBetween` decide por escrito o que isso significa: *"loja própria
é transferência e não venda: não há faturamento nem margem aqui, e o valor apenas muda
de sala."* Ou seja: para quem instala o aplicativo hoje, **não há a quem vender**, e é
por isso que a coluna de preço nunca teve escritor.

Então "o preço combinado" não é um campo na ficha da loja. É esta ordem:

1. ~~**As duas tabelas de preço**~~ — **FEITO em 6 de setembro.** São três, e a
   terceira é a que a refutação salvou: `items.sale_price_rate` (tabela),
   `location_prices` (o combinado, com `id` próprio para atravessar a fila) e
   `sale_price_history` (append-only, `location_id` nulo para a série do preço de
   tabela). Servidor `0037`, aparelho `V22`. **Nada toca o razão**:
   `movements.unit_price_rate` continua sem escritor.

   O portão da leitura é `manage_company` e **não** `view_sale_price`, contra o que
   eu ia escrever: a capacidade diz o QUE se pode ver, nunca QUAIS LINHAS, e cinco
   dos sete papéis a têm — com ela como portão, o gerente de uma loja leria quanto a
   outra paga. Sem coluna que amarre a conta a um lugar, quem administra vê o acordo
   de todos e mais ninguém vê o de ninguém; é mais estreito do que o produto quer, e
   estreito é o lado seguro de errar.

   A tela é a ficha da loja: um campo por produto, com a tabela ao lado (Lei 3) e
   *"era R$ 2,20 até 10/mar"* quando houve renegociação. Três guardas morderam ao
   longo do caminho — o conjunto de apagar, a travessia de colunas e a varredura de
   órfãs da fila —, e um teste achou um defeito de verdade: dois acordos combinados
   no mesmo segundo empatavam em `observed_at` e "de quanto veio" saía pela ordem
   que o SQLite quisesse.
   ~~**E a metade de TABELA ficou sem tela**~~ — **FEITA em 6 de setembro**, e ela é o
   portão P1 aplicado ao meu próprio commit: `saveSalePrice` com `placeId: null` tinha dois
   chamadores, `repository.test.ts` e `device-session.ts`, e `view_sale_price` não tinha um
   único leitor em `app/`. Construir o combinado primeiro — que é o que o dono pediu, e o
   que *vence* a tabela — deu à peça de baixo cara de existente. Agora o campo mora no
   cadastro do produto (`app/products/new.tsx`, gateado por `manage_company`: quem DEFINE) e
   o número na lista (`app/products/index.tsx`, gateado por `view_sale_price`: quem VÊ), com
   o `e2e` de ponta a ponta como chamador de produção. O campo mora em cartão próprio
   logo depois do custo por unidade, e esse lugar é correção de uma FOTO: ele nasceu
   dentro de "Palito, embalagem e rótulo", onde o número vizinho eram os cinco centavos
   da embalagem, sob um título que não é o assunto.

2. **O cliente e a venda** — `customer` criável na tela, embarque como `kind='sale'`,
   e só então o preço congelado no movimento. **Isto é P3 puro** e é decisão de
   faseamento do dono.

**O que a refutação adversarial derrubou da minha primeira forma**, e vale registrar
porque cada um custaria uma migração para desfazer:

- **A regra "preço só quando a contraparte é externa" trava a fila.** As duas pernas
  de uma carga são espelhadas: a perna que entra na loja tem contraparte FÁBRICA, que
  é interna. Um gatilho escrito sobre a contraparte aprova metade do ato e recusa a
  outra — e o motor para no primeiro buraco de propósito. A regra é *"alguma das duas
  pontas é externa"*.
- **O preço combinado tem HISTÓRIA, e sobrescrever perde o que não volta.** O custo
  pode ser sobrescrito porque `purchase_lines` é append-only e `item_cost_history`
  reconstrói; preço digitado à mão não tem fonte nenhuma atrás. "Por quanto vendíamos
  em março" some para sempre.
- **`view_sale_price` não diz QUAIS LINHAS**, e o `access.ts` já avisa isso em voz
  alta. Cinco dos sete papéis têm a capacidade: o gerente da Loja Norte leria quanto a
  Loja Centro paga. Custo não tem esse problema — há um custo. Preço precisa de
  ESCOPO, e escopo é a camada de conta, que ainda não existe.
- **Chave tripla sem `id` não atravessa a fila**, que endereça linha por id único.
- **`price_rate >= 0` mais o idioma `taxa || null`** faria um brinde combinado a zero
  congelar como "não havia preço". Zero não é preço.
- **Devolução relê o preço de hoje** — contra o que `reverseGroup` e `recordCheck` já
  decidiram duas vezes: o ato que volta se avalia pelo valor com que aconteceu.

E uma fronteira herdada, que não é defeito desta forma e vale escrever antes de existir
linha: **`locations` é o LUGAR e a PARTE CONTRATANTE ao mesmo tempo** (a `0019` diz
isso em voz alta — *"loja própria, cliente, distribuidor - tudo é `locations`"*). Uma
rede com cinco filiais negocia uma vez e teria o mesmo preço digitado cinco vezes, e
renegociar exigiria acertar as cinco ou as filiais discordam entre si. O preço congelado
no razão não é afetado; o que herda a conflação é a chave do acordo. O dia em que
aparecer rede, a parte contratante sai de `locations` — e é mais barato saber disso
agora, com zero linhas, do que descobrir com o acordo já digitado.

**O primeiro passo dos dois já entrou**, em 6 de setembro: `customer` é criável na tela
(`app/places.tsx`), com guarda que compara o formulário ao enum do servidor e exige
motivo escrito para cada espécie de fora. Sem isso, o preço combinado só teria como
assunto uma loja nossa — onde o próprio razão decidiu que não há faturamento.

### A configuração da empresa não atravessa — dívida estrutural

Achado ao construir a entrada, 6 de setembro. O servidor tem **quatro** configurações em
`companies`: `floor_sign_in` (0011), `names_who_recorded` (0012), `orders_need_approval`
(0019) e `purchase_safety_days` (0043 — este entrou depois, e o parágrafo dizia três). O aparelho guarda a terceira em `app_meta` e agora as outras duas também — porque
**não existe tabela `companies` no banco do aparelho**, e portanto não existe coluna de
empresa que a sincronia saiba levar.

**E as duas frases que eu escrevi aqui em seguida estavam erradas — corrigidas em 6 de
setembro, antes de construir em cima delas.**

Eu tinha escrito que *"configuração da empresa é a única coisa que dois celulares da mesma
empresa não conseguem combinar"*, e que o conserto era *"uma tabela `companies` no aparelho
entrando na travessia como qualquer outra"*. Fui construir e conferi a premissa primeiro:
**`Transport` só tem `push`** (`src/sync/engine.ts:35`). O docblock do motor diz isso na
primeira linha, sem rodeio — *"sending what the phone wrote while it was alone"*.

Então:

- **Não é a única coisa: hoje dois celulares não combinam NADA.** A produção que o celular
  da fábrica grava não desce para o celular da expedição, porque não existe caminho de
  descida. A frase anterior fazia parecer que tudo mais já concorda e só a configuração
  ficou de fora.
- **E a tabela não consertaria.** Com travessia só de subida, cada aparelho empurraria a
  própria configuração para o servidor — o último a subir vence — e nenhum dos dois
  aprenderia o valor do outro. Seria meio conserto com cara de conserto inteiro, que é o
  que este projeto mais paga caro.

**A dívida verdadeira é: a sincronia é de mão única.** Não é uma tabela que falta, é o
caminho de leitura — e ele não é um `ALTER TABLE`, é uma decisão de desenho (o que o
servidor manda de volta, quando, e quem vence quando os dois lados mexeram na mesma linha).

E o preço dela subiu em 6 de setembro, por minha causa: `floorSignIn` e `namesWhoRecorded`
passaram a decidir **quem vê dinheiro**. Numa fábrica com dois aparelhos, um esconderia
custo e o outro não, sem que ninguém tivesse escolhido isso. Enquanto não houver descida, a
resposta honesta é que **o portão do dinheiro é por aparelho**, e está escrito assim no
`currentCapabilities`.

### Dois defeitos que a medição achou

**`movements.device_id` atravessa a sincronia e não existe no aparelho** — e agora existe
guarda para isso. Ela está na lista de colunas que viajam e nenhum `ALTER TABLE` de
`src/data/db.ts` a cria: viaja como `null`, sempre, e nada falha. O `columns.test.ts` cobrava
só a direção contrária (coluna do aparelho que não sobe); passou a cobrar as duas, com o
`device_id` registrado como fronteira até haver matrícula de aparelho — que é a peça que
precisa do servidor.

**~~Três configurações de empresa sem leitor~~ — TÊM leitor, medido em 7 de setembro.**
`src/data/configuracao.ts:122` lê as quatro do servidor (`names_who_recorded`,
`floor_sign_in`, `orders_need_approval`, `purchase_safety_days`) e grava no aparelho;
`floorSignIn()` é lido em dois lugares diferentes, e confundir os dois já custou uma
leitura errada deste parágrafo: `pisoDoAparelho` (`src/data/repository.ts`) o usa para
decidir o **piso de capacidade** — quem vê dinheiro num aparelho compartilhado —, e
`app/_layout.tsx` o usa para decidir o **caminho de entrada**, mandando para a grade de
nomes. `app/settings.tsx` escreve os dois. O `join_code` é lido por `src/sync/conta.ts`.

Fica a lição de lista, que já apareceu duas vezes esta noite: **item que descreve como
aberto o que já está pronto mente sobre quanto dela é acionável.** Antes de pegar a
próxima, medir a afirmação da linha contra o código — e não confiar nela por estar
escrita.

---

## ~~Dívida das dez funções do domínio sem chamador~~ — PAGA em 6 de setembro

O portão P1 pergunta *quem chama isto no mesmo commit*, e a doença que ele existe para
pegar já tinha aparecido quatro vezes. A medição achou dez funções do domínio que nenhum
código de produção chamava. Verdito uma a uma:

**Quatro saíram**, porque o servidor passou a fazer o que elas faziam: `foldCostEvents`
(um `reduce` de uma linha), `purchaseUnitCost` e `priceMove` — a comparação entre as duas
últimas compras, que `item_cost_history` mais `recentCostChanges` respondem em SQL — e o
tipo `PriceMove` junto.

**Uma ganhou chamador, e fechou um buraco de verdade:** `isValidHierarchy` estava no
domínio desde o começo, exercitada só por teste, e **nada validava hierarquia de
embalagem**. Agora `saveItem` confere antes de gravar — degrau fora de ordem faz o
`UnitStepper` oferecer conversão errada e a conta de caixa sair torta, em silêncio.

**Sete ficaram registradas**, cada uma com a razão em `src/layers.test.ts`. Duas são
promessa escrita antes da funcionalidade (`needsHumanYes`), duas são a F4 que o dono
cortou do mês (`observedLeadTimeDays`, `reorderPoint`), uma implementa regra que o SQL
não faz (`ratesBefore` — o custo de hoje contra o de antes de uma SEQUÊNCIA, que é o que
impede uma alta de 9% em dois passos parecer 2%), uma espera tela (`daysUntilExpiry`) e
duas são primitivas da fundação do dinheiro, presentes para ninguém escrever o
arredondamento na mão.

**E o guarda entrou**, que era o trabalho de verdade: função nova do domínio sem chamador
reprova, a menos que a fronteira seja registrada com o motivo — e registro que ganhou
chamador e ficou na lista também reprova, porque registro que virou mentira é pior que
registro nenhum.

---

## O pacote sai com o dobro do tamanho — medido em 6 de setembro

Compilando o APK aqui (a CI não pode: cota), o arquivo saiu com **48 MB**. Abrindo:

| dentro do APK | tamanho |
|---|---|
| `classes.dex` … `classes5.dex` (cinco arquivos) | **~50 MB descompactados** |
| `lib/arm64-v8a/libreactnative.so` | 7 MB |
| `assets/index.android.bundle` (o JavaScript) | 4 MB |

O bytecode Java/Kotlin domina, e o motivo é uma linha:
`android/app/build.gradle:69` lê `android.enableMinifyInReleaseBuilds` com **`false`** como
padrão, e nada no projeto define a propriedade. Ou seja: **todo APK que este projeto já
publicou saiu sem minificação.**

**E o ganho foi medido, não estimado** — eu tinha escrito "costuma cortar metade", que é
palpite, e aqui se mede:

| | sem R8 | com R8 |
|---|---|---|
| APK | 48 MB | **37 MB** |
| `dex` somados (descompactados) | ~50 MB | **15 MB** |

O R8 corta **70% do bytecode** e só **23% do pacote**, porque o que sobra é biblioteca
nativa e recurso, que ele não toca. A compilação com minificação levou 2m16 e passou — ou
seja, R8 não quebra o BUILD; o que continua sem prova é o tempo de execução.

**Por que não liguei junto:** minificação quebra em tempo de execução, não de compilação —
reflexão, nomes de classe que uma biblioteca resolve por string, `keep` que falta. O jeito
de saber é abrir no aparelho, e eu não tenho aparelho aqui. Ligar às cegas e mandar o APK
seria entregar configuração de release não testada, que é o oposto do que esta casa faz.

**O que isso muda quando for feito:** onze megabytes a menos numa conexão de interior. É
menos do que eu tinha prometido, e é real. Item de véspera de loja, com o número já medido
para ninguém precisar descobri-lo na semana do lançamento.

---

## F3 — o mês que tira o papel do chão de fábrica

O alvo decidido pelo dono. No fim disto, a fábrica para de usar papel para
romaneio, conferência e etiqueta.

**1. Etiqueta e QR do lote — metade entrou em 6 de setembro.** O que faltava era
"quem o leia", e isso eram duas coisas diferentes.

**A que entrou:** o código impresso virou **endereço de verdade**. O QR carrega o
código (`app/lots/[id].tsx:208` imprime `lote.code`) e o `findLot` só conhecia o id —
então bipar a caixa, ou digitar os onze caracteres como a própria etiqueta promete por
escrito, não levava a lugar nenhum. Agora `findLot` aceita os dois (uuid e `AAAAMMDD-NN`
não se confundem), e a aba de produção ganhou onde digitar: o cartão de cima lista os
lotes do DIA, e o comentário dele já dizia a verdade que faltava — *quem procura o lote
de uma caixa procura HORAS depois*. Três dias depois, não havia caminho.

Sem exigir formato: o `lotCode` diz por escrito que `AAAAMMDD-NN` é o padrão e não a
única forma, e a fábrica que já tem código próprio vai poder usá-lo.

**A câmera entrou em 8 de setembro** (`app/scan.tsx`, `expo-camera`), e ela é um
ATALHO para a tela que já existia: quem digita os onze caracteres abre a etiqueta do
lote, e quem aponta a câmera abre a mesma. Dois caminhos que fazem a mesma coisa
envelhecem em velocidades diferentes — então não há caminho paralelo, há uma porta a
mais. A permissão é pedida com a frase que diz para quê, e a recusa não é beco: a tela
lembra que o código está impresso embaixo do quadrado.

**E o botão não apareceu em aparelho nenhum até o conserto do mesmo dia.** Esta linha
dizia *"o botão só aparece onde há câmera (`isAvailableAsync`)"*, e `isAvailableAsync`
não existe no módulo Android — o JS lança, o `catch` lia como "não tem", e a porta que
o item inteiro descreve ficou fechada. Hoje a pergunta só é feita na web, e uma guarda
em `src/layers.test.ts` lê a lista de funções do `CameraViewModule.kt` para que uma
chamada sem dono do lado nativo não passe de novo.

**Nível de evidência: E1 para a leitura** — este container não tem câmera e o navegador
headless também não; quem prova é o tablet do dono, apontando para uma etiqueta impressa

**2.** ~~**Lojas e clientes com ficha de acordo.**~~ **JÁ EXISTE — conferido em 6 de
setembro, e o roadmap estava errado.** A linha dizia "falta a tela" e a tela está
inteira: `app/places.tsx:641` edita e **grava** telefone, dias combinados (a grade dos
sete, com o rótulo por extenso embaixo para quem lê de luva) e a observação do acordo.
E o acordo já é USADO em três lugares — `app/orders/new.tsx:154` nasce o pedido na data
combinada, `app/places.tsx:189` mostra a próxima entrega, e `app/(tabs)/index.tsx:272`
monta "quem recebe hoje" na capa. A fila também o carrega (`src/sync/serialize.ts:159`).
~~O que falta desta ficha é **preço combinado**~~ — **FEITO em 6 de setembro**, e ele veio com três peças em vez de uma: o preço de tabela no item, o combinado por lugar, e a história append-only que é a única fonte dele. A tela é esta mesma ficha. O que ficou de fora, por ser P3 e decisão de faseamento do dono, é congelar o preço no movimento — ver "O preço de venda não é um campo que falta", acima.

**3.** ~~**Pedido com reserva.**~~ **FEITA em 6 de setembro.** A metade que existia era
a que não protege: `livreDe` (`app/orders/new.tsx:207`) já recusava PROMETER além de
`onHand − requested`, e `app/transfer.tsx` limitava a CARGA pelo saldo físico da sala —
que não sabe de promessa. A Loja A pedia 500 para sexta, o freezer tinha 600, e a carga
de hoje para a Loja B levava as 600.

A regra entrou como `freeToShip` (`src/domain/picking.ts`), no domínio e com teste, pelo
motivo que este projeto já pagou duas vezes: o `mutate` roda a suíte rápida, e regra
dentro de componente de React não é alcançada por ela. Ela devolve fato — quanto tem
dono, quem espera (o mais cedo primeiro), e quanto faltaria depois desta carga — e a
tela escreve a frase.

Três decisões dentro dela, cada uma um jeito de errar que foi evitado:

- **O pedido do DESTINO não conta.** Mandar para a Loja A é o que a promessa da Loja A
  pede; contá-la faria a tela avisar contra a própria separação, em toda carga legítima.
- **O saldo comparado é o de TODAS as nossas salas**, não o da sala de origem — a mesma
  base do `stockAgainstOrders`, pela régua compartilhada `INTERNAL_PLACE_KINDS`. Uma sala
  só avisaria contra carga que não quebra promessa nenhuma: 500 reservadas que estão na
  câmara fria continuam existindo quando o caminhão carrega no freezer da frente.
- **Tem horizonte: sete dias, o mesmo do palpite.** Pedido para daqui a cinco semanas
  não disputa o caminhão de hoje — a fábrica produz de novo antes disso. Sem o corte, a
  MESMA tela contava dois conjuntos de pedidos: um para sugerir o número e outro para
  avisar sobre ele. Pedido sem dia marcado conta sempre, que é a letra miúda do SQL que
  a tela de pedido já usava.
- **Não bloqueia.** Às vezes a loja está na porta. A frase de fato aparece sempre que
  alguém espera; o aviso, só quando esta carga passa da folga; o botão obedece nos dois
  casos. E a conta é repetida na confirmação, porque o botão fica embaixo do cartão:
  num telefone a frase de cima pode ter saído da tela quando o dedo chega nele, e o
  toque seguinte já é livro-razão.

**4.** ~~**Separação.**~~ **FEITA em 6 de setembro**, destravada pela decisão de que a carga
é um evento só. Com ela, a pergunta que segurava o item — *o que a separação grava?* — tem
resposta: **nada**. Ela conta; quem move estoque continua sendo a carga.

`app/picking.tsx`, com a porta na aba de transporte. O que ela faz:

- **guarda no aparelho, por loja** (`pickingCart`), e isso é o ponto: a conferência é a
  −18 °C, item a item, e o celular bloqueia. Lista que zera no meio é pior que não existir;
- **conta em engradado**, não em picolé — o `UnitStepper` ganhou chamador depois de meses
  construído, e o eco fecha a conta na unidade que o resto do app fala;
- **termina em carga**: uma transferência por item, e o pedido coberto oferece fechar, pela
  mesma regra que a transferência usa (`ordersCoveredToday`, um lugar só).

**E o eco do stepper terminava a conta pela metade.** Ele dizia "1 engradado" quando o
valor era um engradado exato — a mesma informação do número acima —, enquanto o pedido diz
"faltam 600 un". A pessoa precisava saber de cabeça que um engradado são 300, que é
exatamente a conta mental que o componente existe para remover, e que o exemplo escrito no
dicionário já prometia. Agora ele diz `= 1 engradado = 300 unidades`.

**O que continua fora:** a leitura de QR engradado a engradado na doca (a seção `scan`).
Precisa de câmera — módulo nativo sem implementação web —, e esta sessão não tem como
provar câmera.

**5.** ~~**Os quatro postos de controle.**~~ **RESOLVIDO POR DECISÃO, 6 de setembro.**
A carga é **um evento só** — decisão do dono. Carregar e entregar continuam sendo o mesmo
toque na fábrica, e `conferido` continua sendo o único posto que grava, como já grava hoje
(`recordCheck`, com tela, linha no razão e migração 0017). Não há quatro postos a
construir: há um que existe e três que são rótulo até haver viagem com linha do tempo.
A seção `posts` do dicionário segue registrada como fronteira, agora com prazo indefinido
e motivo novo.

**6. O app do entregador — e ele NÃO é sobre entrega.** *"Depois já desenvolve o app
(seria o login e perfil) do entregador pq isso é necessário para algum outro usuário q vai
comprar o aplicativo."* Decisão do dono, 6 de setembro. Com a carga atômica, o entregador
não tem o que gravar que a fábrica já não grave — então o que este item pede é a **camada
de gente e permissão**, não a tela de entrega:

1. ~~**Gente e perfil no aparelho.**~~ **FEITO em 6 de setembro.** `people` e `profiles`
   entraram nos dois lados (aparelho `V20`, servidor `0035`), a porta "Pessoas" abriu na
   aba Mais, e os sete papéis chegam como MODELOS com nome vazio — a palavra é da tela, em
   três idiomas. A décima quinta garantia do `db:verify` cobra as duas metades contra
   Postgres: pessoa existe **sem conta**, e `operator_id` **só aceita gente** (um id de
   membership passa a ser recusado, que era o único que passava antes).
2. **Perfil é dado.** Os sete papéis de `src/domain/access.ts` viram modelos prontos, e o
   dono marca permissão por permissão. Decisão já registrada no `CLAUDE.md`.
3. ~~**A entrada.**~~ **FEITA.** Grade de nomes com PIN no aparelho compartilhado
   (`app/who.tsx`, com `app/_layout.tsx` mandando para lá quando a empresa liga o
   compartilhado); pessoal entra uma vez e fica. Os dois caminhos existem, escolha da
   empresa — decisão de 1 de setembro.
4. ~~**O operador no movimento.**~~ **FEITO.** Os sete `INSERT INTO movements` gravam
   `operator_id`, e `src/layers.test.ts` reprova o oitavo que não gravar. A tela só
   pergunta quando a empresa liga `names_who_recorded`.

~~**O nó de esquema, e ele se desfaz de graça hoje:**~~ **DESFEITO — e este parágrafo
ficou no presente depois de a coisa ter acontecido, que é a forma mais cara de erro
deste arquivo.** O nó era a `0014` apontar `operator_id` para `memberships(id)`, com
`memberships.user_id` sendo `not null references auth.users`: cada pessoa nomeável
precisaria de uma CONTA, contra a decisão escrita de que *"o login autentica o sistema,
não a pessoa"*. A `0035` desfez: gente virou tabela própria, sem conta, e `membership`
voltou a ser o que sempre foi. A premissa que autorizava dizer "de graça" — *nada
escreve a coluna* — deixou de valer no mesmo dia: **sete `INSERT`s escrevem**, e o
`db:verify` prova contra Postgres que um id de membership passa a ser recusado ali.

**7.** ~~**Devolução.**~~ **FEITA em 6 de setembro.** O movimento já tinha tipo próprio
e tela; o que faltava era o **motivo**, e ele entrou inteiro: `ReturnReason` no domínio
(não vendeu · derreteu no caminho · passou da validade · veio errado), `return_reason` no
aparelho (`V19`) e no servidor (`0034`), obrigatório na devolução **e proibido fora
dela** — a segunda metade é a que costuma faltar, e sem ela uma transferência entre salas
nossas carregaria motivo de devolução, fazendo o Espelho da Loja contar devolução que não
houve. A tela pergunta ao lado da loja, sem opção marcada por padrão (é a única resposta
que o sistema não pode deduzir), e o botão não obedece enquanto ela não for respondida.
A catorzena garantia do `db:verify` cobra as duas metades contra Postgres.

**8.** ~~**O `UnitStepper`.**~~ **ENTROU.** A condição que este item punha — *"entra
quando a tela de separação existir"* — foi satisfeita: `app/picking.tsx` existe, tem
porta em Transporte e o renderiza. A decisão registrada no `CLAUDE.md` (é peça da
F2/F3, apontá-lo como defeito já custou uma rodada) **era verdadeira quando escrita e
deixou de ser** — e o item 4 desta mesma lista comemora o chamador cinquenta linhas
acima, enquanto este continuava chamando o componente de órfão.

**O risco nomeado, e ele não se resolve escrevendo código:** a F3 tem ergonomia que
não se verifica sem aparelho na mão. Tela capacitiva a −18 °C, luva, QR a um braço
de distância. Isso pede rodadas **depois** de alguém usar, e elas só cabem no mês se
o teste acontecer junto, não no fim.

---

## As seis que o dono aprovou — 6 de setembro

Nasceram de uma pergunta dele: *"eu queria saber o q vc tem de ideias que podemos
implementar aqui para elevar o nível do app"*. Ele aprovou as seis e destacou duas —
o extrato (*"essa última sobre a questão fiscal achei excelente, podendo até
extrapolar um pouco"*) e o modo conversa com áudio, com um argumento que o roadmap
já tinha sem enxergar a saída.

Estão aqui e não numa fase porque **atravessam as fases**: nenhuma delas é uma tela
nova, todas são uma propriedade que o produto passa a ter.

---

### 1. O `[por quê?]` em qualquer número

A Lei 6 manda toda conclusão abrir a conta, e hoje **algumas** abrem. A ideia é que
qualquer número responda a um toque longo com a aritmética que o produziu: os
movimentos somados, as datas, a conta por extenso.

O que sustenta: o livro-razão append-only guarda tudo, e `src/law.test.ts` já mantém
a lista de qual comparação cada tela mostra. O que falta é o mecanismo compartilhado
— hoje cada tela abre a sua conta à mão.

**PRIMEIRA CAMADA FEITA em 7 de setembro.** O `WhySheet` deixou de conhecer receita:
recebe uma `Conta` (parcelas e fechos) e serve qualquer número. A aritmética saiu para
`src/domain/conta.ts`, provada por igualdade — as fatias somam um, as partes somam o
total. O gesto é o toque longo, no `Touchable`, com `accessibilityActions` junto.

Dois chamadores hoje: o custo de uma receita e o dinheiro parado nos relatórios
(conferido na mão contra a foto — 11.616,44 + 807,96 + 237,90 + 207,26 = 12.869,56).

**E o item está MUITO mais perto de fechado do que a linha dizia — medido tela a
tela em 7 de setembro.** Os **dezoito** números grandes das telas de `app/` se dividem
assim (a guarda da Lei 3 conta **29**, porque varre também a capa em `src/home/` — o
parêntese que estava aqui atribuía o 18 a ela, e os onze da capa não aparecem na
tabela abaixo; a conta da capa abre num toque, na receita, e isso é fronteira
registrada no `CLAUDE.md`):

| como a conta é alcançada | telas |
|---|---|
| **já aberta na própria página** | produção (*"A conta do número, aberta"*), perdas (cartão por motivo), Espelho da Loja (*"o par que produziu a fração"*), estoque por lugar (*"item por item, logo abaixo"*), transporte (a lista dos destinos), insumos (a lista dos itens) |
| **a folha, porque a conta não cabe** | custo de receita, dinheiro parado |
| **um toque, na tela do assunto** | custo por unidade nos relatórios, custo por receita na lista |
| **não é número** | código do lote, código de convite |

Ou seja: **não sobrou nenhum número grande cuja conta seja inalcançável.** O que
faltava era o MECANISMO para os dois casos em que ela não cabe — e ele foi construído.
O que sobra do item é vigilância: número novo nasce com a conta alcançável, e a guarda
da Lei 3 já cobra a declaração de cada um.

**E a régua de QUANDO usar a folha, que só apareceu ao ir ligar a terceira tela.**
Fui abrir a conta das perdas e ela **já estava aberta**: o segundo cartão da tela
lista cada motivo com o que custou e em quantas vezes, e o comentário dele cita a Lei
6 desde que foi escrito. Uma folha ali seria uma segunda cópia, pior, de uma conta que
já está na página.

Então a folha não é "o jeito de cumprir a Lei 6" — é o jeito **quando a conta não cabe
na página**. Onde ela cabe, ela fica à vista, que é melhor: não depende de gesto nem de
alguém descobrir que existe. O que sobra para ligar são os números cuja conta é longa
ou vem de outra tela — não os que já mostram as parcelas embaixo de si.

**Por que eleva:** é o que faz um dono parar de conferir por fora no caderno. Não é
uma funcionalidade, é a diferença entre um sistema que pede confiança e um que a
prova.

### 2. ~~A conferência cega~~ — JÁ EXISTE na contagem, e o que sobra é a DOCA

**Achado em 7 de setembro seguindo o caminho no emulador, e é correção de registro:**
a conferência cega **está construída** em `app/inputs/[id].tsx:699`, com o raciocínio
escrito ao lado — *"o número desaparece enquanto a contagem está aberta: com ele na
tela a conferência vira cópia, e uma cópia não se distingue de uma contagem"*. Este
item pedia o que já havia. Registro que virou mentira é pior que registro nenhum,
porque manda alguém reconstruir o que existe.

**O que sobra é outro caso, e ele NÃO é o mesmo.** Ao conferir a chegada de uma carga,
a tela de transporte mostra *"4 caixas picolé de morango"* e oferece um toque em
*"Conferir chegada"*. Aí o esperado está na tela, e quem está cansado confirma sem
contar.

**E isso é escolha deliberada, com razão escrita** em `app/(tabs)/transport.tsx:100`:
*"o padrão é 'chegou tudo', porque é o que acontece na maioria das vezes e porque um
formulário de contagem por item, no celular, na doca, ninguém preenche. Quem achou
diferença corrige na tela do lugar, que já sabe registrar contagem cega."*

**Os dois lados estão certos sobre coisas diferentes** — ergonomia da doca contra
qualidade do dado — e por isso a decisão **não é minha**. Ela cai no portão P2 com a
frase saindo inteira: *eu mudaria isto se eu visse alguém conferindo uma carga na doca,
com luva, com o caminhão esperando.* Uma síntese possível existe e cabe em um campo —
perguntar **quantas caixas chegaram**, sem mostrar o número, e só então dizer a
diferença — mas trocar um padrão que alguém escolheu por observação é decisão de quem
observou.

Foi para a espera, com o que a tira de lá.

### 3. O aviso na data da decisão, para tudo

A Lei 4 manda avisar na data da decisão e não na do problema. **Medido em 7 de
setembro, das três coisas que esta linha listava como pendentes, duas estão feitas e a
terceira é duvidosa:**

| o que a linha pedia | estado medido |
|---|---|
| compras — o ponto de recompra | FEITO em 6/9 (`app/inputs/[id].tsx`, folga como configuração) |
| **o lote que vence** | FEITO — `AlertKind` tem `'validade'` com sete dias de antecedência (`src/domain/alerts.ts:132,324`), e o agendador está montado na raiz (`app/_layout.tsx:10`) |
| **a produção** | FEITO em 7/9 — *"Produza Picolé de leite até 17/09"* na tela de produção |
| **o dinheiro parado** | **não deve virar aviso.** O número já aparece com a comparação ("17 dias pelo consumo da semana"), e não existe uma DATA de decisão para ele: dinheiro parado não vence. Um aviso sem data de ação é o alerta inventado que este projeto proíbe na Lei 7 |

O que sobra do item é o segundo passo do lote que vence — *"mande para a loja que gira
mais rápido"* —, e esse depende do Espelho da Loja ter movimento real para saber qual
é. Está na seção **Espera aparelho**, e não aqui.

**Por que eleva:** um app que avisa no dia em que dá para agir é outro produto que
um que avisa no dia do problema.

### 4. O modo conversa — e o áudio, que é o que o dono viu

**"Hey, Norva" — pedido do dono em 7 de setembro**, e ele acertou o motivo antes da
ideia: *"tipo qdo a gente aciona o assistente do google"*. O caso é o que ele mesmo
já tinha dado — *"o padeiro com a mão suja"* — e um botão que precisa ser tocado com
luva **anula o mãos-livres**. A palavra de acionamento não é enfeite: é o que separa
o modo voz de "um jeito diferente de digitar".

**O que joga a favor:** motor de palavra-chave roda **no aparelho e offline**
(Porcupine, openWakeWord), o que combina com a câmara fria; e *"Norva"* é um bom
nome justamente por ser inventado — palavra que não aparece em conversa normal é o
que segura o falso positivo. Com o "Hey" na frente são três sílabas, o mínimo que
funciona.

**O que custa:** um modelo treinado para a frase (pequeno, mas é dependência — pago
no Porcupine para uso comercial, livre no openWakeWord), e bateria, que só pesa em
aparelho fora da tomada.

**E a consequência de desenho, que a ideia CRIA e vale mais que o custo:** este
projeto grava **quem estava com o aparelho**, e um celular que escuta sem ser tocado
quebra essa corrente — quem falou não é necessariamente quem destravou. Num aparelho
compartilhado, **um comando de voz precisa dizer de quem ele é**, ou o movimento é
atribuído à pessoa errada. Some isso ao fato de a escuta contínua ouvir todo mundo o
tempo todo, e a conclusão é a F7: **ligar a palavra de acionamento é configuração da
empresa**, como a entrada por PIN.

**A ordem, e ela não é negociável pela natureza da coisa:** o aplicativo ouvir e
entender vem primeiro, responder por voz vem depois, e acordar sem ser tocado vem por
último. Palavra de acionamento sem assistente que escute é campainha de casa vazia.


`memberships.prefers_conversation` existe desde a fundação (`0001_foundation.sql`)
**sem tela nenhuma**. A ideia é escrever — ou falar — *"chegaram 20 caixas de
morango"* em vez de navegar por quatro telas.

O dono acrescentou o argumento que decide: *"imagina o padeiro com a mão suja…
até para quem eh cego"*. E o roadmap já listava a ergonomia da câmara fria como
risco não resolvido — tela capacitiva a −18°C, luva. **Voz não é atalho ali: é a
única entrada que funciona com a mão ocupada, suja ou dentro de uma luva.**

Três medidas que mudam o desenho:

- **O vocabulário é fechado e minúsculo.** O app já sabe os insumos, produtos,
  unidades, lugares e clientes daquela empresa. Reconhecer trinta palavras e números
  é outro problema que ditado livre — é o que torna modelo pequeno no aparelho
  viável offline, que é o que o dono quer.
- **A rede contra alucinação já é regra da casa.** A confirmação diz o que vai
  acontecer com os números por extenso. Então: voz → interpretação → **o app repete
  o que entendeu** → confirma. Áudio é palpite; a leitura de volta é o que impede
  palpite de virar movimento.
- **As duas metades têm preços muito diferentes.** A voz de SAÍDA é módulo de
  primeira linha da Expo, offline, sem modelo embarcado — barata, e sozinha já
  resolve conferir sem olhar. A de ENTRADA precisa do reconhecedor nativo ou de um
  modelo tipo whisper; nenhum dos dois está no projeto.

**E as três coisas que o dono acrescentou em 6 de setembro, que mudam o desenho:**

- **A confirmação é REDUNDANTE entre sentidos, e o motivo é a fábrica.** Ele pediu
  *"uma piscada… cor de confirmação e cor de erro… ou até um aviso sonoro"*. Cada
  canal falha num ambiente diferente: o galpão barulhento mata o som, a luva mata a
  precisão do toque, e quem está com a mão na massa não olha a tela. Então a
  confirmação não escolhe um canal — acende **cor, vibração e voz ao mesmo tempo**, e
  quem estiver disponível entrega a mensagem. É a forma da F7 aplicada a feedback:
  não se escolhe pelo usuário, os caminhos coexistem.

  E a vibração **já está paga**: `expo-haptics` está no `package.json`. Padrão
  diferente para "gravei" e para "não entendi" sai hoje, sem dependência nova, e é o
  canal que funciona de luva grossa e no escuro.

- **Microfone Bluetooth, e não só a tecla de volume.** Ideia dele, e ela é melhor do
  que conforto: a −18°C a bateria despenca, então com fone **o telefone fica no bolso
  quente ou no carregador** e a pessoa usa só o microfone. O botão do fone é tecla de
  mídia — o mesmo mecanismo de captura da tecla de volume, uma implementação para as
  duas. *A ressalva honesta:* capturar a tecla de volume vale com o app em primeiro
  plano, que é o caso real; com a tela apagada o Android restringe, e aí quem resolve
  é o fone.

- **Não reconheceu: pergunta de novo, com sugestão.** Aqui o vocabulário fechado paga
  outra vez. Genérico seria "não entendi"; com a lista da empresa na mão é *"não achei
  'morango' — você quis dizer Polpa de morango ou Picolé de morango?"*. É a Lei 5
  aplicada à voz: **erro se impede, não se reclama.**

- **E voz nunca é o único caminho** — confirmado por ele: *"com ctz"*. Galpão
  barulhento, pessoa muda, modelo que erra. A entrada por toque continua existindo
  para tudo; voz é outra porta da frente, não a substituição da que existe.

E sobre cegueira, medido antes de prometer: **o trabalho é auditoria, não
construção.** Quem fala é o leitor de tela do sistema, e o app já tem **78 rótulos e
77 papéis** de acessibilidade — com `src/acessivel.test.ts` trancando isso desde 6 de
setembro. *(Dizia "51 e 78", e o 51 não era invenção: era `app/` sozinho, enquanto o
78 era `app/` mais `src/`. Duas bases numa frase só dão um número que nenhuma leitura
sustenta.)* O que ninguém nunca fez foi **ouvir** o app com o TalkBack ligado.

### 5. A etiqueta que vira canal

O QR da caixa hoje abre o lote dentro do app. Se abrisse uma página que a **loja** lê
sem instalar nada — o que chegou, quando, validade —, a etiqueta deixa de ser
controle interno e vira o começo do pedido seguinte.

### 6. O extrato — a PRIMEIRA CAMADA FEITA em 6 de setembro; o resto continua de pé

**A tela existe** (`app/extrato.tsx`, `ledgerExtract` em `src/data/repository.ts`),
por ATO e não por linha, com o valor pela taxa congelada e o `[Desfazer]` ao lado de
qualquer um. Ela nasceu resolvendo um defeito que não era de apresentação: o caminho
de volta existia em **duas** das nove telas que escrevem no razão, e fundação que não
se alcança é fundação que faz a pessoa parar de registrar.

Exercitada no aparelho até o fim — a corrida de sete pernas aparece como um ato, o
desfazer devolve os insumos e marca o ato, e a correção entra como ato próprio
dizendo o que corrige.

**O que dos cinco marcadores abaixo já está de pé:** a exportação fiscal tem a
consulta e o corte por período (`from`/`to`, com o fim exclusivo e teste nas duas
pontas). **O que continua de pé:** o retrato de fechamento guardado, o inventário
assinado, e a regra de fundamentação da IA — ~~o extrato do cliente~~ **entrou seis
minutos depois de esta linha ser escrita**, e ela não foi atualizada: `ledgerExtract`
recebe `placeId`, e `app/places.tsx` navega para ele. Os três pedem coisas que o razão
já tem — nenhum pede esquema novo.

O que o livro-razão append-only torna possível e quase nenhum sistema de fábrica
pequena consegue: **prova, não relatório**. Todo número aqui é derivado de
movimentos que ninguém pode editar, cada um com quem gravou, de qual aparelho e
quando aconteceu no mundo.

- **O extrato é a exportação fiscal antes de existir nota fiscal.** O contador quer
  estoque no fechamento e custo do que saiu; os dois são derivados do razão. Nada
  disso depende de SEFAZ, certificado A1 ou do microserviço .NET que está fora do
  escopo — é a parte fiscal entregável agora.
- **O fechamento de período**, e é aqui que a fundação paga: congelar um retrato e
  guardá-lo, para o número que o contador viu em março continuar recuperável em
  outubro. Como correção aqui é **estorno** e não edição, o histórico continua
  honesto *e* o fechamento continua estável. Num sistema que deixa editar, essas
  duas coisas brigam.
- **O inventário assinado.** A contagem cega, fechada, vira o documento que o fisco
  pede uma vez por ano e que quase toda fábrica pequena inventa em dezembro.
- **O extrato do cliente**, que é a mesma peça virada para fora: tudo o que a loja
  recebeu e devolveu num período. Resolve disputa e é a semente do contas a receber.
- **E é isto que torna a IA segura.** O dono colocou a exigência quando falou do LLM:
  um jeito de impedir alucinação. O extrato **é** esse jeito, e vira regra de
  arquitetura em vez de ajuste de prompt: **a IA não lê o banco, ela lê o extrato.**
  Um assistente que só responde a partir de fato derivado e que abre a conta junto
  não consegue inventar saldo — sem os movimentos, ele não tem resposta.

### Duas que eu acrescentei, e o dono mandou falar

**A régua que a fábrica ensina.** A folga de compra é configuração com padrão dois.
O passo seguinte é o app observar e **propor**: *"nos últimos três meses você sempre
comprou com quatro dias de sobra — quer mudar de 2 para 4?"*. Estende a F7 num
sentido novo: a configuração deixa de esperar calibração nossa e aprende com a
fábrica, sem nunca decidir calada.

**A caixa-preta do aparelho.** Cada escrita já grava aparelho, operador e hora. Uma
linha do tempo por aparelho permite diagnosticar remoto sem perguntar nada a quem
está de luva na câmara — e é quase de graça, porque o dado já está lá.

---

## F4 — a fábrica que se explica sozinha

**Trava por CALIBRAÇÃO, não por construção — corrigido em 6 de setembro.**

Eu tinha escrito "trava por dado", e o dono cobrou a frase: *"vc nao pode alimentar
mais dados no banco de dados??????"*. Ele está certo, e a confusão era minha: eu tinha
misturado três coisas que travam por motivos diferentes.

| | trava? | por quê |
|---|---|---|
| **Fiscal (NF-e)** | **sim** | certificado A1 e homologação na SEFAZ. Externo, e não encurta com dado nenhum. |
| **Espelho da Loja** | **não** | o relatório se constrói e se exercita hoje. |
| **Compras inteligentes** | **não, e o motivo mudou em 6 de setembro** | esta linha dizia *"o prazo observado a simulação gera"*, e é falso: `purchases.ordered_at` existe desde a fundação, `recordPurchase` o grava e a travessia o leva — ~~mas **ninguém escreve nele**, nem a tela de compra nem a simulação~~ — **as duas escrevem desde 6 de setembro**, e esta linha chegou falsa ao disco: foi escrita no MESMO commit que acrescentou a pergunta a `app/purchase.tsx`. A pergunta que ela dava como travando já está na tela, e é a pergunta rara que a Lei 1 permite, porque a data de um telefonema para o fornecedor não está no razão. **O que trava agora é tempo:** o prazo só fica confiável com entregas observadas. |

O que é verdade dos dois últimos não é "não dá para construir", é **não dá para
calibrar**: qualquer padrão que o relatório descubra num banco semeado é um padrão que
a semeadura plantou, e a régua — *isto é perda demais*, *compre agora* — só se afere
contra uma fábrica. Então eles entram como **construir agora, calibrar depois**, com a
régua marcada no código como suposição até alguém usá-la.

E semear mais **compra coisa real**: consulta exercitada com o razão crescido,
desempenho medido em vez de estimado, telas com o que dizer. Hoje são noventa dias
(`HORIZONTE_DE_TESTE`); um ano é trocar uma constante.

**O Espelho da Loja — a captura já grava, e o relatório passou a ser dos de agora.**
Contagem cega e perdas com motivo já existem. O parágrafo que estava aqui dizia que o
relatório *"fica fora por decisão escrita: ele mente com duas semanas de dado"* — e ele
contradizia a tabela logo acima, revista em 6 de setembro depois de o dono cobrar a
frase. A correção separou duas coisas que eu tinha misturado: **não dá para calibrar**
não é **não dá para construir**. Então o relatório entra, com a régua marcada no código
como suposição até alguém usá-la contra uma fábrica.
*(O `CLAUDE.md` ainda traz o corte de 1 de setembro com a razão antiga. Fica anotado
aqui em vez de eu reescrever sozinho a lista de cortes do dono.)*

*Anotado em 5 de setembro, para não virar acusação depois:* `sale` está em
`MovementKind` (`src/domain/ledger.ts:24`) e **não tem caminho de escrita** — é o
único tipo do razão nessa situação. Pelo portão P1 isso seria dívida; aqui é o
contrário, e por uma razão escrita no próprio arquivo: o vocabulário de um razão só
é livre para mudar enquanto não há linha nenhuma gravada com ele, então ele nasce
inteiro e os escritores chegam por fase. A semeadura de três meses **não** inventou
um `recordSale` por causa disso: ela usa a contagem cega, que é o que a fábrica de
verdade sabe hoje sobre a prateleira do cliente.

**Compras inteligentes.** Precisam do **prazo observado** de cada fornecedor — o
tempo real entre pedir e chegar. *E o motivo do corte mudou de forma em 6 de setembro,
sem esta linha acompanhar:* o mecanismo existe e é lido em duas superfícies (a ficha do
insumo e o aviso), e a semeadura já preenche `ordered_at`. Não é adivinhação com cara
de matemática — sem prazo, o gatilho é nulo e a tela cala. **O que falta é calibração
com entregas de uma fábrica de verdade**, que é espera, não construção.

**A previsão aplicada.** O clima já entra na tela. Cruzar clima com venda observada
para prever demanda é F4 pelo mesmo motivo.

---

## F5 — o fiscal

Projeto à parte, e o plano inteiro é desenhado para que **nada dependa dele**.
Microserviço .NET, certificado digital A1, homologação na SEFAZ. O que trava é
administrativo: o layout quem decide é a SEFAZ, e a homologação tem fila.

Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6.

---

## F6 — publicar nas lojas

O que falta não é código de produto; é a papelada e as decisões que só o dono toma.

- **A licença do clima.** O Open-Meteo é gratuito para uso **não comercial**. Para
  publicar: ou troca de provedor, ou entra plano pago. **Decisão de gasto, é do
  dono.**
- **Política de privacidade e declaração de dados.** O que o app coleta e para onde
  manda — Supabase, Open-Meteo, atualizações da Expo. Exigência das duas lojas.
- **LGPD.** Dado pessoal identificável: o que é, onde mora, e como se apaga a
  pedido.
- **Permissões do Android.** Pedir só o que se usa. Permissão a mais é recusa na
  revisão.
- **O que fazer quando quebra.** Hoje o app tem tela de erro e nenhum relato. Sem
  isso, uma falha na fábrica de um cliente é invisível daqui.
- **Ícone, splash e nome.** Feito em 4 de setembro: as seis superfícies saem do
  mesmo `markPath` do `brand.ts`, por `scripts/icons.mjs`.
- **Busca de marca.** `NORVA` ainda não passou por busca de anterioridade no INPI
  (classes 9 e 42). Precisa de login gov.br — não é automatizável. Nada mais no
  código chumba o nome: trocar de marca é editar `src/config/brand.ts` e o
  `app.json` — **e isso era promessa até 7 de setembro, quando virou guarda.** Uma
  auditoria achou quatro lugares embarcando "NORVA" (o título da folha de partilha do
  backup e a recusa de cópia nos três idiomas); `src/marca.test.ts` reprova o quinto.

---

## F7 — os trunfos

Diferencial de mercado, não a dor de hoje. Roteirização de entrega, PAC/POD, clima
aplicado à produção. Entram depois da F4 porque todos precisam do dado que ela
acumula.

---

## Fora do escopo, por decisão escrita

Não se re-litiga o que já foi decidido. A razão é o que impede a decisão de voltar
como "boa ideia" numa sessão futura.

| fora | razão escrita |
|---|---|
| ~~**Relatório do Espelho da Loja**~~ **— voltou, e a razão escrita estava confusa** | o corte dizia *"mente com duas semanas de dado"*, e isso misturava **não dá para calibrar** com **não dá para construir**. O dono cobrou a frase (*"vc nao pode alimentar mais dados no banco de dados??????"*) e a tabela da F4 foi corrigida em 6 de setembro; o relatório entrou junto, **sem régua de "devolve demais" em lugar nenhum** — essa parte continua precisando de fábrica. |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; nada depende dele |
| **Compras inteligentes** | ~~precisam do prazo observado, que só existe depois de meses de nota~~ — **o mecanismo está construído e lido; o que falta é calibração com entregas reais** |
| **Trunfos** (PAC/POD, clima, roteirização) | diferencial de mercado, não a dor de hoje |

E as decisões do dono que **restringem desenho futuro** — leia antes de "consertar"
qualquer uma delas:

- **Entrada no chão de fábrica é configuração da empresa**, não escolha nossa: PIN
  numa grade de nomes (compartilhado) e conta pessoal, os dois existem.
- **Quem cria a empresa é o dono**, e daí ele cadastra pessoas **ou** aprova quem
  pediu associação por código. Os dois caminhos.
- **O relatório fala de onde, não de quem.** O livro-razão sempre grava quem
  (`recorded_by`); nomear na tela é opt-in (`names_who_recorded`).
- **`recorded_by` e `operator_id` são duas perguntas** — qual conta escreveu
  (imposto pelo servidor, incedível) e quem estava com o aparelho. Uma coluna só
  para as duas já custou uma rodada.
- **Aparelho emprestado entra como produção e nada mais** — papel `operator`, sem
  custo, sem preço, sem dinheiro.
- **O operador confere a prateleira.** O que protege o número é o piso — contagem
  perguntada toda vez, gravada como diferença —, não a permissão.
- **A luz da tela é do aparelho, e o padrão é o claro.** Decisão do dono, 4 de
  setembro. Claro, escuro e seguir o aparelho: os três caminhos existem.

---

## Como a ordem é decidida

Não por fase — o portão é **por item**, nesta ordem, e a primeira pergunta que
reprovar decide.

**P1 — quem chama isto no mesmo commit?** Sem chamador, não entra. É a doença
provada deste repositório: coluna, função, chave de dicionário e tabela que
existiram sem escritor. Quando nada chama uma peça há **três** respostas honestas —
trazer o chamador, apagar a peça, ou registrar a fronteira com quem vai chamá-la.
Escrever teste não é uma delas: já foi tentado, e só tornou a morte mais difícil de
ver.

**P2 — complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item
depende de observar alguém usando. **Mas antes de travar:** se o que muda com a
observação é *preferência de quem usa*, não é espera nem pergunta — é configuração,
e os dois caminhos existem.

**P3 — entrando errado, conserta com um commit ou com migração e estorno?** O que
toca `supabase/migrations/`, o caminho de escrita de `movements` ou a semântica de
`movement_kind`/`location_kind` é caro e permanente. Forma de esquema se adivinha de
graça enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna.

Consequência prática: **o que é P3 e está barato agora sobe na lista**, e o que é P2
puro espera uso real em vez de virar código adivinhado.

---

## Como este plano se mantém vivo

Três regras, e as três existem porque a alternativa apodrece:

1. **Item fechado sai daqui no mesmo commit que o fecha.** Plano que lista o que já
   existe manda alguém construir duas vezes — e o custo não é o tempo, é a
   confiança: depois do segundo item errado, ninguém lê mais o arquivo.
2. **Item novo entra com evidência de arquivo.** `arquivo:linha` que sustenta o
   estado. Sem isso é palpite, e palpite em plano tem a mesma cara de fato.
3. **Item parado carrega o que o destrava**, não uma promessa de data. "Precisa de
   aparelho na mão" é informação; "semana que vem" é ficção.

E uma quarta, que nasceu de o próprio topo deste arquivo já ter mentido uma vez: **o
resumo do estado é conferido contra o corpo antes de fechar a sessão.** Ele chegou a
dizer "os cinco estão fechados e a procura trouxe o item 6" depois de o item 6 ter
sido fechado — a cabeça do arquivo contradizendo o corpo dele doze linhas abaixo,
no arquivo que existe justamente para a próxima sessão confiar.
