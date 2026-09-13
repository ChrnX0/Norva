## 31. Registro de aprendizados — parte B

Catálogo da segunda metade de `docs/insights.md` — de `docs/insights.md:1806` até o
fim do arquivo (`docs/insights.md:3569`), **quarenta e nove registros**, todos
datados de **3 e 4 de setembro de 2026**. O item imediatamente anterior
(`docs/insights.md:1765-1805`, o método que destravou o design) pertence à parte A.

A regra de admissão do registro é a mesma da parte A, transcrita da abertura do
arquivo: *"achado sem consequência não entra aqui. Cada linha existe porque um
arquivo foi editado. E 'não achei nada' é entrada válida — não se inventa achado
para parecer diligente, pelo mesmo motivo que não se inventa alerta."*
(`docs/insights.md:5-8`)

Convenções deste catálogo:

- Cada item traz **o que se viu**, **por que importa**, **o que mudou** e, quando o
  registro a formula, **a regra que fica** — que é a frase que o autor deixou para
  a próxima sessão. Quando o registro não traz um dos quatro, está escrito
  "NÃO ESTÁ NO REGISTRO".
- O estado de cada peça (implementada e chamada por tela · implementada sem
  chamador · planejada) é o estado **no momento do achado**; quando eu pude
  confirmar o estado atual da árvore por leitura direta do código, está dito com o
  arquivo e a linha da confirmação.
- Números, datas, nomes de arquivo, nomes de coluna e trechos de SQL vão
  transcritos. Onde o registro não diz, está escrito "NÃO ESTÁ NO CÓDIGO".

---

### 31.1 O portão de mutação e os instrumentos que mentem

Cinco registros da segunda metade são sobre a ferramenta de verificação estar
quebrada, e não o código verificado. Eles formam a espinha do dia 4 de setembro.

#### B1 — 3/9: o `mutate` roda a suíte rápida, e isso decide onde a regra mora (`docs/insights.md:1806-1844`)

**O que se viu.** Um mutante sobreviveu **três vezes** à barra inteira: o que
inverte a ordem do palpite da separação — *pedido ganha do hábito*
(`docs/insights.md:1808-1811`).

As três tentativas, cada uma ensinando outra coisa:

| tentativa | o que se fez | resultado |
|---|---|---|
| 1ª | asserção de e2e: com pedido em aberto, a tela sugere o número do pedido | não matou (`docs/insights.md:1813-1815`) |
| 2ª | achou-se que a sugestão era calculada em **dois lugares** — o número mostrado no campo e o número usado para gravar; inverter a ordem mudava um e deixava o outro, ou seja *"o app gravou diferente do que estava escrito"*. Unificou-se | não matou (`docs/insights.md:1817-1821`) |
| 3ª | o motivo estrutural: `scripts/mutate.mjs` roda `npm test`, a suíte rápida, e **regra que mora dentro de um componente de React nunca é alcançada por ele**, por mais e2e que se escreva | (`docs/insights.md:1823-1827`) |

O precedente citado no mesmo registro: a zona de silêncio do QR *"sobreviveu a
dois mutantes até descer para `src/domain/qr.ts`"* (`docs/insights.md:1826-1827`).

**A regra que fica, e ela é de arquitetura, não de teste.** *"Toda decisão que
merece um mutante mora no domínio. Se está numa tela, ou não merece o mutante, ou
está no lugar errado."* `pickSuggestion` e `qrPath` nasceram desse critério
(`docs/insights.md:1829-1832`).

Estado atual confirmado por leitura: `pickSuggestion` está em
`src/domain/picking.ts:23` e é chamada por `app/transfer.tsx:188` — **implementada
e chamada por tela**; `qrPath` está em `src/domain/qr.ts` e é chamada por
`src/components/QrCode.tsx:21` — **implementada e chamada por componente de tela**.

**O caso de negócio que apareceu no caminho.** *"Pedido de zero é um pedido, não a
ausência de um. A loja que pediu e cancelou não pode receber de volta o envio da
semana passada — `ordered ?? lastSent` acerta isso e `ordered || lastSent`
erraria."* (`docs/insights.md:1834-1838`) O teste que fixa isso existe em
`src/domain/picking.test.ts:20`: `pickSuggestion({ ordered: 0, lastSent: 40 })`
deve devolver `0`.

**A quarta lição, de método.** O teste da primeira tentativa passava com a mutação
aplicada porque naquele fluxo *"a loja **nunca tinha recebido carga**: com uma das
duas fontes vazia, qualquer ordem dá o mesmo número. Teste de regra de precedência
só prova alguma coisa com as duas fontes **discordando**"* — e é a mesma família do
teste da margem do QR, *"que usava a própria constante nos dois lados da igualdade
e não podia falhar"* (`docs/insights.md:1840-1844`).

#### B2 — 4/9: o portão de mutação estava verde por construção, e ninguém tinha como notar (`docs/insights.md:2945-3020`)

O registro se autodeclara *"o achado mais grave do dia"*: **`npm run mutate`
declarava toda mutação "pega" sem nunca ter consultado a suíte. Desde 3 de
setembro. Sessenta e seis commits.** (`docs/insights.md:2947-2950`)

**O mecanismo, de uma linha.** O `mutate` copia o projeto para uma oficina e roda a
suíte lá; `suitePasses(dir)` devolvia verdadeiro se a saída contivesse `# fail 0`,
e `pego = !suitePasses(dir)`. A lista do que copiar era de **inclusão**
(`docs/insights.md:2952-2957`):

```js
const COPIAR = ['src', 'scripts', 'package.json', 'tsconfig.json'];
```

Escrita em 3 de setembro, *"quando os testes só liam `src/`"*. Depois disso a suíte
ganhou guardas que leem o repositório: o dicionário varre `app/`, os seletores leem
`e2e/flow.mjs`, o acordo lê `supabase/migrations`, e a tabela passou a ler
`CLAUDE.md` e `docs/roadmap.md`. Na oficina esses arquivos não existiam, então
esses testes *"morriam no carregamento com `ENOENT`"*
(`docs/insights.md:2959-2963`).

**A medida.** *"A suíte da oficina saía com `# fail 19` sem mutação nenhuma. Logo
`suitePasses` era falso sempre, `pego` era verdadeiro sempre, e o relatório dizia
'os 90 defeitos foram pegos' sem que um único deles tivesse sido julgado."*
(`docs/insights.md:2965-2968`)

**Por que era invisível.** *"Não é um teste vermelho que alguém ignorou — é um
portão que só sabe dizer sim. O CI roda `npm run mutate`, o `push-guard` exige
veredito fresco, e os dois concordavam. Cada vez que a suíte ganhava um guard novo
que lia o repositório, o portão ficava um pouco mais cego, e a única evidência
disso era um relatório cada vez mais bonito."* E o fechamento:
*"Ele nasceu porque 'suíte verde não quer dizer regra protegida'. Ele virou a coisa
que ele denuncia."* (`docs/insights.md:2970-2979`)

**O que estava escondido.** Com a oficina consertada, **seis mutações sobreviveram**
— quatro buracos reais e dois mutantes equivalentes
(`docs/insights.md:2981-3000`):

| # | mutação sobrevivente | o que ela significa na fábrica |
|---|---|---|
| 1 | `blendRate` (`src/domain/cost.ts`) trocada por `return arriving.rate` | *"a média móvel do produto fabricado não tinha um único teste com estoque em mãos. Os que a citavam passavam pelo caso em que ela é a identidade… o estoque antigo passa a valer o preço da corrida de hoje"* |
| 2 | a contagem de movimentos na confirmação de apagar compras — *"escrita por mim hoje de manhã"*, com a fixação do teste trazendo `movements: 0` | *"Zero faz a asserção passar com ou sem o campo. Vazia, de novo."* |
| 3 | a corrida aberta gravando `product.recipeId` na coluna da versão | *"o teste existia e conferia o **objeto devolvido**, não a linha gravada — e a mutação trocava só o parâmetro do `INSERT`"* |
| 4 | o `NAO_ESTORNADO` sumindo da consulta de "produzido no período" | *"o almoxarifado fica certo e a capa continua dizendo que a fábrica produziu o que foi desfeito"* — textualmente a cicatriz de 3 de setembro (item B19) |

**O que mudou.** A lista virou de **exclusão** — `node_modules`, `.git`, `dist`,
`.expo`, `.shots`, `android`, `.mutate` — *"então um teste novo que leia um arquivo
novo continua funcionando sem ninguém lembrar de nada"*. E a oficina **prova que
serve antes de julgar**: roda a suíte sem mutação e aborta com a lista de falhas se
ela não passar, porque *"sem isso, oficina quebrada e suíte perfeita são
indistinguíveis — as duas fazem `suitePasses` devolver falso"*
(`docs/insights.md:3002-3008`).

Os quatro buracos ganharam teste; os dois equivalentes ganharam marcador com motivo
escrito — *"o estorno tem duas checagens em camadas, tirar uma deixa a outra
pegando, e só concorrência real as separaria"*. E o marcador **não é escapatória**:
*"se a mutação for pega, ele vira erro, senão a lista apodrece guardando desculpa
para buraco já fechado"* (`docs/insights.md:3010-3014`).

**A regra que fica.** *"Toda ferramenta de verificação precisa de uma verificação de
si mesma, e ela tem que rodar antes do veredito, não depois. A pergunta é sempre a
mesma: **como este instrumento se pareceria se estivesse quebrado?** Aqui a resposta
era 'exatamente como um instrumento perfeito' — e essa resposta é o próprio
defeito."* (`docs/insights.md:3016-3020`)

O registro fecha nomeando a família: *"é também a terceira forma da mesma doença num
dia: lista escrita à mão que envelhece longe de quem a usa. `erase.ts` conhecia 12
de 21 tabelas; a tabela do plano envelheceu no dia em que nasceu; e aqui uma lista
de quatro pastas decidia, sem saber, se o portão inteiro perguntava alguma coisa."*
(`docs/insights.md:3017-3020`)

#### B3 — 4/9: `import()` não é checagem de sintaxe, e o que ficou rodando por oito horas (`docs/insights.md:3021-3067`)

**O que se viu.** Listando processos para entender por que a auditoria estava lenta,
apareceram restos com **oito e nove horas de idade**: um
`node -e "import('./scripts/mutate.mjs')"` **órfão (`ppid 1`)**, o trabalhador de
mutação que ele abriu, o trabalhador de uma execução anterior, e um laço
`until grep` de espera (`docs/insights.md:3023-3027`).

A causa: *"eu tinha escrito aquele `node -e import(...)` como **checagem de
sintaxe**… `import()` de um módulo com efeito de topo **executa o módulo** — então a
checagem de sintaxe disparou a suíte de mutação inteira. E o `&` no fim do comando a
órfãou: `ppid 1`, fora de qualquer árvore de processo que eu fosse olhar depois."*
(`docs/insights.md:3029-3033`)

**O custo, medido.** *"Quatro núcleos nesta máquina. O limite de concorrência de um
workflow é `min(16, núcleos − 2)` = **2**, e esses restos disputavam os mesmos
núcleos. A auditoria de dez frentes levou duas horas para a primeira fase; o `e2e`
saiu `17/17 com 2 fatias vermelhas` numa execução, que eu diagnostiquei como disputa
com o `mutate` que eu mesmo tinha acabado de rodar — verdade parcial, e não a causa.
A causa estava rodando desde a manhã."* (`docs/insights.md:3035-3041`)

**A prova nos dois sentidos**, transcrita (`docs/insights.md:3043-3050`):

```
$ node -e "import('./efeito.mjs')"
EU RODEI — e isto devia ser só uma checagem de sintaxe

$ node --check efeito.mjs
(silêncio — sintaxe boa, e nada rodou)
```

**O que mudou.** Regra nova na seção de operação do `CLAUDE.md`, ao lado da que
proíbe matar processo por padrão — *"que é a irmã dela, e foi a que me deu o caminho
seguro para limpar: parar **pelo PID que eu mesmo anotei**, conferindo antes a
paternidade de cada um para não derrubar a execução em vôo"*
(`docs/insights.md:3052-3057`).

**A regra que fica.** *"A maneira de verificar uma coisa não pode ser fazer a
coisa."* E a segunda metade: *"o que roda em segundo plano tem que ficar numa árvore
que eu consiga olhar. `&` num comando de sessão entrega o processo ao init, e a
partir daí ele não aparece em nenhum lugar que eu vá procurar por hábito."*
(`docs/insights.md:3059-3067`)

#### B4 — 4/9: a terceira vez que "não terminou" virou "pegou" (`docs/insights.md:3234-3272`)

**O que se viu.** A bateria de mutação acusou `MARCADOR ERRADO` num marcador de
equivalência que estava certo. *"Antes de tirar o marcador — que é o que a mensagem
manda fazer — apliquei as duas mutações marcadas à mão e rodei a suíte inteira: as
**328** passam nas duas. O marcador estava certo; o relatório estava errado."*
(`docs/insights.md:3236-3240`)

**A causa, uma linha.** `suitePasses` era `return stdout.includes('# fail 0')`.
*"Toda execução que **não imprime resumo** cai no lado do 'falhou', e 'falhou' quer
dizer 'pegou'. Eu estava rodando `npm test` em paralelo com a bateria numa máquina
de quatro núcleos com quatro frentes de mutação; uma execução não terminou; virou
proteção."* (`docs/insights.md:3242-3247`)

**A terceira aparição da mesma forma no mesmo arquivo**, nomeadas pelo próprio
registro (`docs/insights.md:3249-3255`):

1. a oficina não copiava as pastas que os testes leem, a suíte morria lá com 19
   falhas antes de qualquer mutação, e o portão ficou verde por construção durante
   66 commits;
2. a oficina declarando "pego" sem consultar a suíte;
3. esta, *"a mais estreita — mas a forma é idêntica, e a forma é o achado"*.

**A regra que fica.** *"Instrumento que só distingue dois estados chama ausência de
medida de resultado favorável. 'Passou' e 'não passou' parecem exaustivos e não
são: falta 'não mediu'. E o default silencioso cai sempre para o lado que agrada —
num portão de mutação, 'pegou'; num de permissão, 'autorizado'; numa checagem de
saldo, 'tem'. Onde há três estados e o código lê dois, o terceiro vira o que quem
escreveu esperava ver."* (`docs/insights.md:3257-3263`)

**A segunda metade, autocrítica.** *"Eu criei a contenção que produziu o falso alarme
rodando a suíte enquanto a bateria rodava — e a regra do `CLAUDE.md` sobre não ficar
ocioso diz para tocar o que **não depende** do que está rodando. Rodar a suíte
enquanto a bateria roda a suíte 98 vezes não é trabalhar em paralelo: é disputar a
própria medida. O que dá para fazer enquanto a barra roda é documento e leitura, e
nada que peça CPU."* (`docs/insights.md:3265-3270`)

**O que mudou.** *"Três resultados em vez de dois (`lerSuite`), segunda chance só
para o que não terminou — medida que não houve é barata de repetir, resultado que
houve não se repete até gostar dele —, reprovação como `NÃO MEDIDO` se persistir, e
a régua conferida com quatro casos sintéticos antes de qualquer medida"*
(`docs/insights.md:3271-3272`). Confirmado na árvore: `lerSuite` em
`scripts/mutate.mjs:1064`, a segunda chance em `scripts/mutate.mjs:1103-1107`
(`let lido = lerSuite(rodar()); if (lido === 'inconclusivo') lido = lerSuite(rodar())`)
e a impressão `NÃO MEDIDO` em `scripts/mutate.mjs:1203`.

#### B5 — 4/9: o `pkill` matou o próprio comando, de novo (`docs/insights.md:3392-3409`)

**O que se viu.** *"Eu escrevi `pkill -f "serve -s dist -l 4179"` para derrubar um
servidor de teste — e o padrão casou com **o próprio comando do shell**, que continha
aquela string. O shell morreu no meio, e o `node` que vinha depois (a reescrita de
uma checagem do e2e) nunca rodou. Eu só descobri porque conferi o arquivo depois e
ele estava intacto: o comando 'terminou' com um código de saída estranho e nenhuma
mensagem."* (`docs/insights.md:3394-3400`)

*"Segunda aparição na história deste projeto, com a regra já escrita. A primeira
matou uma verificação em vôo; esta matou a mão que a escrevia."*
(`docs/insights.md:3402-3403`)

**A regra que fica.** *"`pkill -f` procura no que EU acabei de escrever. A linha de
comando do próprio shell é um processo com aquele texto dentro, então todo padrão
amplo se inclui. Se for para parar por padrão, o padrão tem de excluir o próprio PID
(`pgrep -f … | grep -v $$`) — e a saída barata continua sendo a da regra: anotar o
PID quando inicio, e parar por ele."* (`docs/insights.md:3405-3409`)

---

### 31.2 Guardas que não guardavam — e as guardas que nasceram por causa disso

Doze registros da segunda metade têm a mesma forma: existia uma guarda, ela passava
verde, e o que ela media não era o que ela prometia.

#### B6 — 3/9: o guard media tabela, e a política é por TIPO (`docs/insights.md:1845-1882`)

**O que se viu.** A sessão do aparelho (`scripts/device-session.ts`) tinha um guard
que recusava rodar se alguma tabela que o `serialize` sabe mandar não fosse
exercitada. *"Ele estava certo e media a coisa errada"*
(`docs/insights.md:1847-1851`).

No servidor, `movements_append` decide por **kind**, não por tabela — o trecho
transcrito no registro (`docs/insights.md:1853-1862`):

```sql
case kind
  when 'production'  then has_capability(company_id, 'record_production')
  when 'transfer'    then has_capability(company_id, 'dispatch')
  when 'loss'        then has_capability(company_id, 'record_loss')
  when 'return'      then has_capability(company_id, 'check_receipt')
  ...
```

*"Uma sessão que grava movimento de três tipos e replica só dois passa no guard de
tabela com a política do terceiro **nunca exercitada**."*
(`docs/insights.md:1864-1865`)

**O tamanho do buraco, medido.** *"Fui atrás porque a devolução que entrou hoje nunca
tinha sido replicada. Com o guard passando a medir tipo, apareceu que
**transferência e perda também não eram**: de sete tipos que este aplicativo sabe
escrever, **três** nunca tinham encostado nas políticas do servidor. Não é hipótese —
as três só falhariam na primeira loja que devolvesse mercadoria, ou na primeira perda
registrada, em produção, com a fila inteira parada atrás."*
(`docs/insights.md:1867-1872`)

**A regra que fica.** *"Um guard de cobertura tem que medir a dimensão em que a REGRA
varia, não a dimensão em que o dado é organizado. Aqui a regra varia por `kind`; a
tabela é só onde ele mora."* (`docs/insights.md:1874-1878`)

**A fronteira, escrita.** *"E a lista cobrada é a do que o app SABE escrever, não o
enum inteiro do servidor: `sale` e `reversal` não têm escritor, e cobrar por eles
seria pedir que a sessão finja um caminho que não existe — que é a mesma mentira, do
outro lado."* (`docs/insights.md:1880-1882`)

#### B7 — 3/9: a lei mais citada do projeto não era conferida por nada (`docs/insights.md:1883-1919`)

**O que se viu.** A varredura tela a tela pela Lei da Inteligência achou o mesmo
defeito três vezes seguidas, *"e nenhuma suíte tinha reclamado de nenhuma delas"*: o
transporte dizia **"3 destinos hoje"**, o almoxarifado dizia **"R$ 1.552,50 parado"**
e o relatório de perdas dizia **"R$ 148,00 em 4 perdas"** — os três números sozinhos,
sem comparação ao lado. O item 3 da lei (*"nenhum número aparece sozinho — sempre com
a comparação"*) está no `CLAUDE.md` desde o começo do projeto
(`docs/insights.md:1885-1891`).

**Por que importa.** *"Três não é coincidência, é a taxa. A capa foi auditada quando
foi redesenhada, e por isso compara; toda tela que não passou por uma auditoria dessas
nasceu com o número nu, porque a lei mora num arquivo de texto e texto não roda."* E o
efeito: *"R$ 1.552,50 parado no estoque é um mês tranquilo numa fábrica e dinheiro
morto noutra, e quem abre a tela não tem como saber qual das duas é a dele — então o
número grande vira decoração, e a tela ensina que os números daqui não servem para
decidir."* (`docs/insights.md:1893-1901`)

**O que mudou, com a comparação honesta de cada tela** (`docs/insights.md:1903-1910`):

| tela | comparação escolhida | por quê |
|---|---|---|
| transporte | com **ontem** | NÃO ESTÁ NO REGISTRO além da escolha |
| perdas | com os **trinta dias anteriores** | *"mesma duração, mesmos motivos"* |
| almoxarifado | **não** compara com o mês passado; compara com **quanto tempo aquilo dura** na saída que a própria fábrica registrou | *"valorizar o saldo de agosto ao preço de setembro seria inventar dinheiro"* |

Para a frase do almoxarifado falar do mesmo conjunto que o número, *"`runningOut`
passou a recortar por sala e por tipo, com o mutante que prova o recorte"*
(`docs/insights.md:1909-1910`).

**E a lei virou teste, que é o ponto.** `src/law.test.ts` mantém um registro: *"toda
tela com número grande declara qual é a comparação dela, ou escreve por que não há o
que comparar. O registro existe em vez de uma heurística porque exigir comparação de
todo número grande alarmaria errado — num formulário o número é o que a pessoa está
digitando agora, e a comparação dele é o próprio formulário."* Provado nos dois
sentidos: *"uma tela falsa com `type.figure` reprova, e apagar a comparação de uma
tela declarada reprova"* (`docs/insights.md:1912-1919`). Confirmado na árvore:
`src/law.test.ts` existe, com 175 linhas.

#### B8 — 3/9: a Lei 3 era medida por arquivo, e a capa tem dez números (`docs/insights.md:2134-2166`)

**O que se viu.** A guarda do item anterior funcionava, *"só que a chave do registro é
o **caminho do arquivo**, e a capa não é uma tela — é dez. `src/home/Mosaic.tsx` tinha
uma declaração (`/noYesterday|madeYesterday/`) e passava verde por causa da produção,
enquanto as caixas enviadas, os tachos abertos e as entregas do dia apareciam nus ao
lado."* (`docs/insights.md:2136-2143`)

**Como apareceu.** *"Não foi lendo o teste. Foi um refutador tentando derrubar um item
de roadmap que dizia 'o cartão de caixas mostra o número sem o ontem': ele confirmou o
item e, ao explicar por que a suíte não pegava, descreveu o buraco — 'o registro
aprova o arquivo pela comparação da produção e não vê esta figura'."*
(`docs/insights.md:2145-2149`)

**Por que importa mais que o cartão.** *"Uma guarda com granularidade errada é pior
que guarda nenhuma, porque **compra silêncio**: a suíte verde afirmava que a Lei 3
estava conferida na capa, e nove dos dez números nunca tinham sido olhados por
ninguém. É o mesmo defeito do `mutate` na primeira execução — verde por
coincidência, não por proteção."* (`docs/insights.md:2151-2155`)

**O que mudou.** *"A régua passou a ser por número: a contagem de `type.figure` do
arquivo tem que bater com a quantidade de declarações. Um número grande novo quebra a
suíte até ganhar a sua linha. As dez declarações da capa foram escritas uma a uma, e
três delas são 'sozinho' com o motivo por extenso — contagem regressiva compara com o
próprio limite, estado ao vivo responde a segunda pergunta da lei, lista de afazeres
do dia se compara com o acordo, não com ontem. Provado quebrando: retirada uma
declaração, o teste acusa `mostra 10 e declara 9`."* (`docs/insights.md:2157-2163`)

**E o cartão foi consertado junto**, com o que já estava calculado e ninguém lia:
`loose` (o que saiu sem caber em caixa) e as chaves `alsoSent`/`alsoSentItem`, *"que
existiam nos três idiomas sem um único leitor"* (`docs/insights.md:2165-2166`) —
estado no momento do achado: **dicionário implementado sem leitor**, agora com leitor.

#### B9 — 3/9: o guard escrito passaria verde na cicatriz que ele cita (`docs/insights.md:2077-2106`)

**O que se viu.** Um guard novo para *"frase de tela cravada em vez de no
dicionário"*, cujo docblock dizia que ele teria pegado o `WhySheet` — a folha do
`[por quê?]`, que tinha **"Custo do lote"** e **"Perda prevista"** em português. *"A
régua era **acento**. 'Custo do lote' não tem acento nenhum."*
(`docs/insights.md:2079-2083`)

**Por que importa mais que o bug.** *"Um guard que passa verde no próprio caso que
cita é pior que guard ausente: ele **anuncia** uma proteção que não existe, e alguém
para de procurar aquele defeito à mão."* E a lição de forma: *"todo guard precisa de um
teste que reprove com a cicatriz original, não com um exemplo inventado depois."*
(`docs/insights.md:2085-2091`)

**O que mudou.** *"A régua passou a ser palavra funcional ('do', 'da', 'de', 'para',
'que'…) com espaço, e não caminho."* Os três alarmes falsos que ela produziu ficaram
fixados como casos (`docs/insights.md:2093-2098`):

| alarme falso | motivo |
|---|---|
| `as Draft['kind']` | `as` é palavra-chave do TypeScript |
| `'input'` | literal de uma palavra não é frase |
| `@/domain/day` | caminho de importação casa com "do" |

**E na primeira execução de verdade ele achou um defeito.** *"A confirmação da produção
montava `` `${quantidade} ${unidade} de ${nome}` `` — com o **'de' cravado**. Em inglês
a frase sai '18.000 g **de** Polpa' no meio de uma interface traduzida. Foi para
`common.amountOf`, que em inglês é 'of'."* (`docs/insights.md:2100-2106`)

#### B10 — 3/9: a régua que o dono digitava não saía do aparelho (`docs/insights.md:2047-2076`)

**O que se viu.** Auditando o eixo que o `CLAUDE.md` nomeia — *o que o aparelho grava
contra o que o servidor aceitaria* — achou-se **`items.full_level` fora do
serializador**. *"A coluna existia no aparelho, a tela escrevia nela, o teste do
repositório provava que ela persistia, e ela **nunca chegaria ao servidor**."*
(`docs/insights.md:2049-2054`)

**Por que importa.** *"É a forma mais silenciosa de perda de dado que este projeto tem:
nada falha. Um celular novo da mesma fábrica abriria sem faixa de cor nenhuma, o dono
cadastraria a régua de novo, e ninguém saberia por quê. E o guard que já existe — o da
sessão do aparelho — cobra **tabela** sem escritor, um andar acima de onde o defeito
estava."* (`docs/insights.md:2056-2061`)

**O que mudou.** A coluna atravessa, e nasceu um guard de **coluna**:
`src/sync/columns.test.ts` *"compara cada coluna das tabelas do aparelho com o que o
serializador manda, e exige que a diferença esteja **escrita** — ou vai no `take`, ou
tem uma linha dizendo por que fica aqui. Registro em vez de heurística, como no
`law.test.ts`: existem colunas que legitimamente não sobem, e a diferença entre 'não
sobe porque é do aparelho' e 'não sobe porque alguém esqueceu' não está no nome dela."*
(`docs/insights.md:2063-2070`) Confirmado na árvore: `src/sync/columns.test.ts`, 123
linhas.

**E ele achou uma segunda no primeiro uso:** `purchase_lines.created_at` — *"essa é
legítima — o servidor não tem a coluna, a linha de compra herda a hora da nota — e
agora está declarada com o motivo, em vez de ser uma ausência que ninguém sabia
explicar."* (`docs/insights.md:2072-2074`)

**E uma regra de construção de guarda.** *"A lista de colunas que o `build` acrescenta
é obtida CHAMANDO o build, não escrita ao lado dele. Uma lista à mão ao lado do código
é a mesma lista à mão que já deixou `src/weather` fora da checagem de camadas por
meses."* (`docs/insights.md:2075-2076`)

#### B11 — 4/9: o CI vermelho por uma palavra trocada num arquivo de tradução (`docs/insights.md:2497-2546`)

**O que aconteceu.** *"Renomeei um rótulo — `howMany` deixou de ser 'Quantas
{{pack}}', que saía na tela como **'QUANTAS SACO 25 KG'**, e virou 'Quantidade, em
{{pack}}'. Três checagens do e2e continuaram procurando `getByLabel(/Quantas/)`.
Empurrei; o CI ficou vermelho vinte minutos depois, no navegador."*
(`docs/insights.md:2499-2504`)

**Por que a barra não pegou.** *"Ela pegou — só tarde. A ordem foi: rodei a barra
inteira, depois olhei as fotos, fiz quatro correções do que só se vê olhando (e uma
delas era o rótulo), e empurrei sem rodar o e2e de novo. O `push-guard` exige veredito
fresco para o HEAD e **o veredito não inclui o e2e**: o portão mecânico roda tipo,
lint e unidade."* (`docs/insights.md:2506-2511`)

**O que dói não é o erro, é a distância.** *"Renomear um rótulo é uma linha num arquivo
de tradução. Descobrir por que o navegador não achou o campo é uma execução inteira da
suíte, três esperas de trinta segundos, e um log que diz `locator.fill: Timeout` sem
dizer que a culpa está no dicionário."* (`docs/insights.md:2513-2517`)

**O que mudou.** `src/selectors.test.ts` *"lê os seletores do `e2e/flow.mjs` e exige
que cada um ainda case com alguma frase do dicionário pt-BR — em milissegundos, no
`npm test`. Ele não prova que a tela mostra aquele texto: prova que o texto que o e2e
procura **existe no aplicativo**"*. O que a tela compõe (nome semeado, código de lote,
rótulo de acessibilidade montado) *"entra numa lista de renúncias com motivo escrito, e
um terceiro teste recusa renúncia que ninguém usa mais"* (`docs/insights.md:2519-2526`).
Confirmado na árvore: `src/selectors.test.ts`, 153 linhas.

**E ela quase nasceu com o defeito que caça.** *"O import começou como `default`, o
dicionário chegou indefinido, a lista de frases ficou vazia — e aí *toda* comparação é
falsa, então o primeiro seletor da lista levava a culpa por um erro que não era dele.
Uma guarda que reprova pelo motivo errado é pior que guarda nenhuma: manda consertar o
lugar errado. A contagem antes da comparação virou a primeira linha do arquivo. É a
terceira vez no mesmo dia que a asserção de presença faltou ao lado da de ausência."*
(`docs/insights.md:2528-2535`)

**E a terceira repetição virou guard na proofgate.** *"'Afirmar ausência sobre um
sujeito que pode estar vazio' apareceu três vezes num dia — no teste do assistente, na
asserção do e2e e na guarda nova — e é padrão que um script pega. Virou
`56-vacuous-negative` na proofgate ([PR #16](https://github.com/ChrnX0/proofgate/pull/16)):
dispara quando uma linha afirma ausência sobre um sujeito que o mesmo diff defaultou
para vazio e nada naquele arquivo afirma um comprimento. Estreito de propósito — só
arquivo de teste, WARN, e medido contra um diff real de 31 mil linhas com zero
disparos."* (`docs/insights.md:2539-2546`)

**A regra que fica.** *"Um teste que dirige o aplicativo por texto tem uma dependência
que o compilador não vê — o dicionário. Onde existe essa costura invisível, cabe uma
guarda barata que a torne visível **na velocidade da unidade**, em vez de deixá-la
reprovar na velocidade do navegador."* (`docs/insights.md:2537-2538`)

#### B12 — 4/9: sete seções de dicionário sem leitor, e o número está escrito no `CLAUDE.md` (`docs/insights.md:2547-2586`)

**O que se viu.** O `CLAUDE.md` cita *"quatro seções de dicionário nos três idiomas sem
uma tela"*. A varredura achou **sete** — *"870 chaves no total, e sete blocos de topo
que nada lê"* (`docs/insights.md:2549-2553`).

**Antes de chamar de defeito, a decisão.** Três têm escopo escrito e não são
esquecimento (`docs/insights.md:2555-2560`):

| seção | por que fica |
|---|---|
| `posts` | os quatro postos de controle da F3 |
| `stepper` | o `UnitStepper` — decisão registrada, *"e apontá-lo como defeito já custou uma rodada antes"* |
| `scan` | a leitura do QR na doca — *"o QR já é impresso, quem lê ainda não existe"* |

As outras quatro eram **rascunho anterior, já substituído pela tela viva**
(`docs/insights.md:2562-2570`):

| seção morta | o que a substituiu |
|---|---|
| `areas` | nomeava um menu de oito áreas que não existe, *"com duas delas cortadas por decisão escrita (Espelho da Loja e Financeiro)"* |
| `production` — "Rende {{units}}", "Vai baixar do almoxarifado", "Custo desta produção" | `app.production` *"já diz as mesmas três coisas com outras palavras"* |
| `confirmation.shipment` | `app.transfer.confirmBody` |
| `assistant.title: 'Modo Conversa'` | `app.assistant`, *"onde 'modo conversa' virou a sobrelinha e o título virou 'Pergunte'"* |

**Por que isso é defeito e não sobra inofensiva.** *"Seção morta **parece viva**. Quem
for renomear 'Custo desta produção' acha primeiro a cópia que ninguém lê, muda ali, e a
tela continua dizendo o que dizia — com o commit verde, o teste verde, e o dono
apontando o texto velho na semana seguinte."* (`docs/insights.md:2572-2576`)

**O que mudou.** *"As quatro saíram dos três idiomas (98 linhas), e
`src/dictionary.test.ts` passou a exigir que toda seção tenha leitor **ou** uma linha na
lista de fronteiras dizendo QUEM vai lê-la. Um segundo teste recusa fronteira que já
ganhou leitor, para a lista não virar cemitério. A mutação nova prova que morde."*
(`docs/insights.md:2578-2582`) Confirmado na árvore: `src/dictionary.test.ts`, 89 linhas.

**A regra que fica.** *"O portão P1 diz o que *entra* sem chamador. Faltava a outra
metade — o que **fica** sem chamador depois que o chamador some. Peça sem chamador não é
um evento de entrada, é um estado, e estado se mede continuamente."*
(`docs/insights.md:2584-2586`)

#### B13 — 4/9: a guarda comparava a lista com ela mesma, e nove tabelas ficavam (`docs/insights.md:2780-2824`)

**O que se viu.** `src/data/erase.test.ts` tinha um teste chamado *"erasing everything
reaches every table that holds business data"*. *"Ele percorria um `Record` escrito à
mão logo acima e conferia se cada chave estava em `tablesFor('all')`. O `Record` tinha
exatamente as doze entradas do union `ErasableTable`, e `tablesFor('all')` devolvia
essas mesmas doze."* (`docs/insights.md:2782-2788`)

*"A asserção era **'todo membro do conjunto fechado está na lista do conjunto
fechado'**. Uma tabela que não estivesse no union era invisível para o teste **por
construção** — não por esquecimento, por forma. O autor do mapa e o autor da lista eram
a mesma pessoa lembrando das mesmas doze tabelas, e o teste perguntava se ela lembrava
do que tinha acabado de escrever."* (`docs/insights.md:2790-2795`)

**O que isso escondia** (`docs/insights.md:2797-2804`):

- *"O aparelho tem 21 tabelas. Nove nunca eram apagadas, e cinco delas apontam para
  `items` ou `locations` com `ON DELETE RESTRICT` — que são justamente as duas que o
  'apagar tudo' apaga. Toda corrida de produção grava um `lots`. Então **a partir da
  primeira corrida**, 'Apagar tudo' levantava `FOREIGN KEY constraint failed`, a
  transação voltava atrás, **nada** era apagado, e a tela mostrava o texto cru do
  SQLite em inglês — num aplicativo que promete três idiomas, e depois do toque em vez
  de o botão nascer desabilitado com o motivo."*
- O vizinho: *"`tablesFor('purchases')` começa com `movements`, e o `DELETE` é por
  empresa. Apagar 'compras' apagava **todo movimento da fábrica** — produção, contagem,
  perda, transferência — com a confirmação dizendo que zerava o custo médio.
  Irreversível pelo texto da própria tela, e sem cópia no servidor."*
  (`docs/insights.md:2806-2810`)

**O que mudou.** *"A guarda passou a **ler** `src/data/db.ts`: as tabelas criadas e as
arestas de `RESTRICT`, inclusive as que entram por `ALTER` em migrações posteriores (a
grade do produto). É o mesmo conserto que o `db:verify` fez quando parou de rodar como
superusuário — perguntar ao sistema em vez de perguntar à lembrança de quem escreveu o
teste. E a lista de renúncias (`app_meta`, a gaveta do aparelho) pede motivo escrito,
com um segundo teste recusando renúncia de tabela que não existe mais."*
(`docs/insights.md:2812-2818`) Confirmado na árvore: `src/data/erase.test.ts`, 307 linhas.

**E ela achou um alarme inventado na primeira execução.** *"Cobrou de 'apagar produtos'
a regra do 'apagar tudo'. Não vale — `blockerFor` recusa as áreas menores **antes** do
toque, com o número junto, que é a Lei 5. Só o `all` não tem rede (`erase.ts:176`
devolve `null`), e a premissa está presa no teste com contagens que bloqueariam qualquer
outra área."* (`docs/insights.md:2820-2823`)

**A regra que fica.** *"Uma guarda que compara duas coisas escritas pela mesma mão não
guarda nada. A pergunta certa para toda guarda é: **de onde vem o outro lado da
comparação?** Se a resposta é 'do mesmo arquivo', o teste mede memória, não sistema."*
(`docs/insights.md:2824`)

#### B14 — 4/9: a tabela chamada "medido, não afirmado" envelheceu no dia em que foi escrita (`docs/insights.md:2896-2944`)

**O que se viu.** O `docs/roadmap.md` passou a abrir com uma tabela sob o título *"onde
o produto está hoje — **medido, não afirmado**"*, com uma coluna **como conferir**
trazendo o comando ao lado de cada número. Escrita de manhã; *"antes do fim da tarde
estava errada em quatro linhas: **26 migrações contra 27, 303 testes contra 309, 88
mutações contra 90, 8 garantias contra 9**"* (`docs/insights.md:2898-2905`).

E pior no `CLAUDE.md`: *"o bloco de comandos dizia 'Postgres descartável, **oito**
garantias' depois de o `db:verify` ter passado a ter nove. Não é seção histórica com
data — é referência, no arquivo que **toda sessão lê primeiro**."*
(`docs/insights.md:2907-2911`)

**Por que passou.** *"As duas tinham o antídoto escrito ao lado e ele não funcionou. A
tabela traz o comando de conferência linha a linha; o plano tem uma regra dizendo que
'item novo entra com evidência de arquivo — sem isso é palpite, e palpite em plano tem a
mesma cara de fato'. Nada disso impede o envelhecimento, porque **comando escrito é
convite, não garantia**: ninguém roda quinze comandos antes de acreditar numa tabela. E
o segundo lado da mesma frase é o que dói — **tabela velha tem exatamente a mesma cara
de tabela certa.**"* (`docs/insights.md:2913-2920`)

*"O número do `db:verify` mora em três lugares e só **um** é fato: quantos blocos
`==> check N:` o script tem. A frase que ele imprime no fim e o comentário do
`CLAUDE.md` são alguém lembrando — e foi por lembrança que um ficou certo e o outro não.
Eu atualizei os dois no mesmo dia e errei um."* (`docs/insights.md:2922-2926`)

**O que mudou.** *"`src/bar.test.ts` passa a **ser aquela coluna, executada**: dez
linhas derivadas do sistema e comparadas com o que os documentos afirmam, com o sistema
mandando sempre. Inclusive a contagem de testes, que se deriva estaticamente (toda
chamada é `test(` no topo do arquivo) e bate exata com a runtime."*
(`docs/insights.md:2928-2932`) Confirmado na árvore: `src/bar.test.ts`, 175 linhas; e o
`scripts/verify-migrations.sh` hoje tem **treze** blocos `==> check N:`
(`scripts/verify-migrations.sh:99,124,176,202,318,417,560,637,688,732,773,812,849`).

**A prova de que morde**, antes de acreditar nela: *"com o número velho no `CLAUDE.md`
ela reprova nomeando o certo e o escrito; com uma décima checagem acrescentada ao script
ela reprova em **duas** asserções ao mesmo tempo, a frase final e o `CLAUDE.md`"*
(`docs/insights.md:2934-2937`).

**A fronteira, escrita no arquivo.** *"Ela confere o que foi **registrado**, não descobre
o que não foi. Uma linha nova na tabela sem entrada na guarda não quebra nada. O que ela
impede é o número registrado envelhecer."* (`docs/insights.md:2939-2942`)

**A regra que fica.** *"Documentar a forma de conferir não é conferir. Todo número que um
documento afirma sobre o sistema é um segundo autor da mesma verdade, e o segundo autor
sempre atrasa. Ou o número sai de uma derivação, ou ele tem uma guarda — a terceira
opção, que é confiar em quem escreveu, é a que produziu as duas cicatrizes de hoje com o
antídoto escrito ao lado."* (`docs/insights.md:2941-2944`)

#### B15 — 4/9: o docblock descrevia o defeito, e a tela o cometeu de qualquer jeito (`docs/insights.md:3068-3101`)

**O que se viu.** `recordCount` exige `locationId` sem padrão, e a razão está escrita na
assinatura desde que ela nasceu, transcrita (`docs/insights.md:3072-3075`):

> *"With a default, counting the cold room without saying so would compare against the
> company's whole balance and write the difference into the cold room — stock teleported
> between rooms by an operator who did everything right."*

*"`app/inputs/[id].tsx` mostrava `findItem(LOCAL_COMPANY_ID, id)` — sem sala, portanto o
total da empresa — e gravava `locationId: defaultLocationId(LOCAL_COMPANY_ID)`. As duas
linhas ficavam a 130 linhas de distância uma da outra, cada uma correta sozinha. Juntas
eram exatamente o parágrafo acima, com o sinal trocado: com **44.000 g** na fábrica e
**6.000** na câmara, quem abrisse o item pelo filtro da câmara, contasse a prateleira e
digitasse 6.000 gravava **−38.000 contra a fábrica**. Trinta e oito quilos apagados de
uma prateleira que ninguém tinha olhado — e contagem não se apaga, se estorna."*
(`docs/insights.md:3077-3085`)

**A regra que fica: docblock não é guarda.** *"A prevenção morava na prosa ao lado do
parâmetro, e o parâmetro aceitava `defaultLocationId(...)` com um sorriso… Exigir o campo
garante que alguém responda *onde*; não garante que a resposta seja o lugar cujo número
está na tela."* (`docs/insights.md:3087-3092`)

**O que mudou.** *"A tela passa a sala pela rota (`app/inputs/index.tsx`), `findItem` e
`itemMovements` aceitam a sala, e a contagem grava onde ela leu. Com o item em mais de um
lugar e nenhum escolhido, a contagem **não é oferecida**: a tela lista os lugares com o
saldo de cada um e cada linha leva à contagem daquele lugar — erro que impede, com a
saída à vista. A guarda nova em `src/layers.test.ts` reprova qualquer tela que ponha
chamada de função no local de uma contagem, porque o defeito não está em função nenhuma:
está na combinação de duas linhas distantes dentro de uma tela, que é justamente o que
teste de unidade não vê."* (`docs/insights.md:3094-3101`) Confirmado na árvore:
`src/layers.test.ts`, 542 linhas.

#### B16 — 4/9: o mundo do dublê não fechava, e era isso que deixava a mentira passar (`docs/insights.md:3102-3127`)

**O que se viu.** Ao consertar a contagem falada, o teste do assistente ficou vermelho
*"por um motivo melhor que o meu conserto. O dublê dizia que a empresa tem **50.000 g** de
açúcar (`ITEMS`) e, ao mesmo tempo, que ele está **50.000 na fábrica mais 6.000 na loja**
(`PLACE_STOCK`). Os dois números saem da mesma soma no sistema de verdade: `listItems` sem
local é `stockByPlace` somado. O dublê descrevia um mundo impossível."*
(`docs/insights.md:3104-3110`)

**Por que importa.** *"Num mundo em que a soma dos lugares não é o total, a diferença
entre 'o total da empresa' e 'a prateleira desta sala' não tem como ser observada — é
ruído do fixture, não sintoma. Foi por isso que a contagem falada comparava o total com
uma prateleira e **trinta e quatro testes** ficaram verdes."*
(`docs/insights.md:3112-3117`)

**A regra que fica.** *"O dublê tem que satisfazer as invariantes que o sistema impõe. Não
é purismo — é o que decide se o teste pode enxergar a violação. Um fixture que quebra uma
invariante é um lugar onde essa invariante não pode ser testada, e um teste verde ali
afirma menos do que parece."* (`docs/insights.md:3119-3122`)

**O que mudou.** *"`PLACE_STOCK` passou a fechar (**44.000 + 6.000 = 50.000**), e duas
asserções mudaram junto — as duas para números mais certos: 'o que tem na fábrica' agora
diz 44.000, e o recusão de carga diz 'tem só 44.000 na fábrica'. Elas afirmavam o total da
empresa achando que afirmavam o da sala. E um teste novo cobre o caso que não existia:
item em duas salas não é contado por voz, é localizado."* (`docs/insights.md:3124-3127`)

#### B17 — 4/9: a checagem do navegador AFIRMAVA o defeito (`docs/insights.md:3501-3515`)

**O que se viu.** Consertados os quatro chamadores de porcentagem à mão (item B40), *"o
`e2e` reprovou: ele exigia `41.1%` e a tela passou a escrever `41,1%`. A checagem estava
certa em relação ao código e errada em relação ao mundo — foi escrita lendo o que a tela
imprimia, e o que a tela imprimia era o ponto decimal do JavaScript numa fábrica
brasileira."* (`docs/insights.md:3503-3508`)

*"Duas asserções, as duas verdes por semanas, as duas travando o defeito no lugar. Uma
suíte que roda num navegador de verdade não protege de nada quando a asserção nasce de uma
cópia da saída."* (`docs/insights.md:3510-3512`)

**A regra que fica.** *"Asserção se escreve da REGRA, não da saída. 'Português escreve
porcentagem com vírgula' é uma regra e sobrevive a qualquer refatoração; `41.1%` é uma
fotocópia, e fotocópia de tela errada é defeito com teste de guarda-costas."*
(`docs/insights.md:3514-3515`)

---

### 31.3 Livro-razão: estorno, valor do que sai do tacho, local — e a fila que não podia reenviar

#### B18 — 4/9: a política de update existia, e era isso que escondia o defeito (`docs/insights.md:2732-2779`)

**O que se viu.** Uma varredura de sete eixos com refutação adversarial — *"19 achados
julgados, 4 de pé, 15 derrubados"* — encontrou a **terceira** aparição da mesma família:
*"a fila do aparelho sobe com `on conflict do update`, e a tabela não deixa reenviar"*
(`docs/insights.md:2734-2737`).

*"A 0015 consertou isso para `purchases` e `purchase_lines`. A 0020 consertou para
`lots`. Nas duas, o defeito tinha a mesma forma — política de insert e **nenhuma** de
update. E foi essa forma que virou a frase escrita aqui no dia 1º: 'todas as outras
tabelas que ela escreve têm um `_manage FOR ALL`, que cobre update'."*
(`docs/insights.md:2739-2743`)

**A forma nova.** *"`orders` **tem** política de update. Ela pede `approve_order`,
`dispatch` ou `manage_company`, e a de insert pede `place_order` — e três dos sete papéis
do produto (`storeManager`, `customer`, `salesperson`) têm o segundo e nenhum dos
primeiros. A busca por 'tabela sem política de update' nunca a encontraria."*
(`docs/insights.md:2745-2749`)

**Por que passou pela barra.** *"Duas coisas, e as duas são a mesma: a verificação usava
contas mais poderosas do que as reais. A checagem 6 sobe a fila inteira com
`enum_range(null::capability)` — todas as capacidades que existem. A checagem 8, que é a
do pedido, dá à 'Vendedora' `place_order` **mais** `dispatch`, e é o `dispatch` que faz o
update passar. **Nenhuma conta com a capacidade mínima de um papel real jamais rodou a
segunda passagem da fila.** É a mesma doença que o `db:verify` já teve e já consertou uma
vez, quando rodava como superusuário."* (`docs/insights.md:2751-2759`)

**O que mudou.** *"Migração `0027`, e ela é de duas peças porque RLS não consegue dizer
'contanto que não mude' — a expressão não enxerga o antes e o depois ao mesmo tempo. A
política deixa o **autor** reenviar o próprio pedido; um gatilho devolve `status` e
`decided_at` quando quem escreve não decide. É exatamente o que a 0019 já faz no insert,
com a razão escrita lá: o payload vem de fora."* (`docs/insights.md:2761-2767`)
Confirmado na árvore: `supabase/migrations/0027_a_resend_is_not_a_decision.sql`.

**E o nome do gatilho é estrutural.** *"O Postgres roda os `before` em ordem alfabética, e
`orders_decision_fields_stay_put` precisa vir antes de
`orders_leave_pending_only_by_approval`. Renomear qualquer um sem saber devolve o defeito
**sem nada ficar vermelho**."* (`docs/insights.md:2769-2772`)

**A prova.** *"A **checagem 9** do `db:verify` sobe a fila duas vezes pela capacidade
mínima de um papel real. Provei que ela morde tirando a migração: reprova com `new row
violates row-level security policy (USING expression) for table "orders"`."*
(`docs/insights.md:2774-2776`) Confirmado na árvore:
`scripts/verify-migrations.sh:688` — *"check 9: o reenvio da fila passa pela capacidade
MÍNIMA de quem escreveu"*.

**A regra que fica.** *"Quando uma família reaparece, procure a forma nova, não a forma
velha. A frase que registra um conserto vira o gabarito da próxima busca — e um gabarito é
tão bom quanto o caso que o gerou. Aqui ele descrevia 'ausência de política' e o caso novo
era 'política com a capacidade errada'."* (`docs/insights.md:2778-2779`)

#### B19 — 3/9: o estorno acertava o saldo e deixava oito telas mentindo (`docs/insights.md:2167-2202`)

**O que se viu.** *"A fundação diz que se corrige por estorno, nunca por exclusão, e o
estorno **não tinha escritor** — esquema, restrição, política e o construtor de
`ledger.ts` existiam sem ninguém que gravasse."* Estado no momento do achado:
**implementado sem chamador**. Escrito o escritor, *"os três testes unitários passaram de
primeira: o ato inteiro volta pelo grupo, saldo negativo é recusado, e estornar duas vezes
é recusado"* (`docs/insights.md:2169-2174`).

**E o navegador reprovou.** *"O e2e dirigiu o caminho inteiro — produção, lote, corrigir,
confirmar — e o saldo do almoxarifado voltou certinho enquanto *'Produzido hoje: 500'*
continuava lá. A razão é estrutural e vale para qualquer livro-razão: **saldo é soma pura
e não olha `kind`**, então ele se corrige sozinho; mas toda tela de 'o que aconteceu'
filtra por `kind`, e um movimento de `kind = 'reversal'` não é `'production'`."*
(`docs/insights.md:2176-2182`)

**As oito consultas afetadas**, nomeadas: *"produção do dia, série da semana, lotes do
dia, últimas corridas, remessas, perdas, o palpite da separação e a fila de conferência —
continuariam contando um ato que foi cancelado"* (`docs/insights.md:2182-2185`).

**Por que importa além deste commit.** *"O defeito não estava no escritor: estava na
suposição de que escrever a correção *é* corrigir. Num sistema append-only, todo leitor
que pergunta 'o que aconteceu' é um lugar onde a correção precisa chegar, e nenhum deles
reclama — eles simplesmente respondem o número velho. Foi o que teria ido para a mão do
dono: o almoxarifado certo e a produção mentindo, no mesmo aplicativo, na mesma hora."*
(`docs/insights.md:2187-2192`)

**O que mudou.** *"Um `naoEstornado(alias)` só, usado nas oito consultas, porque a mesma
frase SQL escrita oito vezes é onde a nona esquece. E a checagem e2e ficou como registro
do caminho completo: o lote sai da lista do dia (uma corrida corrigida não foi produzida
hoje) mas continua existindo pelo endereço, dizendo 'esta corrida já foi corrigida' —
porque a etiqueta pode já estar colada numa caixa e quem lê o QR precisa achar a
verdade."* (`docs/insights.md:2194-2199`)

Confirmado na árvore, com o nome final em maiúsculas: a subconsulta é
`const NAO_ESTORNADO = 'NOT EXISTS (SELECT 1 FROM movements rev …'`
(`src/data/repository.ts:750`), usada em `src/data/repository.ts:728`, `2213`, `2535`,
`2588`, `2623`, `2694` e adiante; e há um índice dedicado para ela — o docblock em
`src/data/db.ts:648` diz que *"`NAO_ESTORNADO` (src/data/repository.ts) é uma subconsulta
correlacionada"* e `src/data/db.test.ts:105` afirma que ela *"não pode voltar a varrer o
livro-razão inteiro por linha"*.

**A regra que fica.** *"Teste unitário prova a escrita; só o aplicativo dirigido prova a
LEITURA. As duas metades de uma correção moram em arquivos diferentes, e a suíte que só
exercita a primeira passa verde numa correção pela metade."*
(`docs/insights.md:2201-2202`)

#### B20 — 3/9: o dinheiro evaporava do balanço a cada corrida de produção (`docs/insights.md:2203-2248`)

**O que se viu.** *"A tela de lugares dizia, embaixo de 'Loja Centro': *'um item · vale
R$ 0,00'* — com **1.466 picolés** listados logo abaixo. Não era formatação. `item_costs` só
tem um autor, `recordPurchase`, e picolé nunca é comprado: ele sai do tacho. Sem linha em
`item_costs`, o produto acabado vale zero em toda consulta que valora estoque."*
(`docs/insights.md:2205-2211`)

**Por que é maior que uma tela.** *"O consumo tira o insumo do saldo **com o valor junto**,
e a produção põe o produto de volta valendo nada. O balanço da empresa encolhe a cada
corrida, em silêncio, exatamente pelo custo do que foi produzido. E o zero se espalhava
por caminhos que ninguém ligaria a esse: `moveBetween` e `recordLoss` leem a taxa de
`item_costs`, então uma transferência de produto gravava `unit_cost_rate` **NULO** nas
duas pernas, e uma perda de produto acabado era avaliada em zero — perda que a tela de
perdas soma em dinheiro."* (`docs/insights.md:2213-2220`)

**A decisão que parecia cobrir isso, e não cobria.** Havia docblock escrito: *"Nada é
escrito em `item_costs`. Valor derivado tem um autor só, e a média já responde sozinha."*
*"A frase é verdadeira sobre o INSUMO consumido — consumo à taxa média não move a média
dele. E é sobre outro `item_id`. Para o produto não havia autor nenhum, nem no aparelho
nem no servidor. **'Um autor só' não estava sendo cumprido; estava sendo dispensado** — e
esse é o formato mais perigoso de justificativa: verdadeira, escrita, e sobre outra
coisa."* (`docs/insights.md:2222-2229`)

**Como apareceu.** *"Olhando uma foto de tela. A varredura de defeitos leu `/places` e viu
'vale R$ 0,00' ao lado de mil e quatrocentos picolés; três refutadores independentes
tentaram derrubar a leitura e os três a confirmaram, um deles reproduzindo com teste
descartável. O primeiro conserto proposto — trocar a fonte da consulta para
`movements.unit_cost_rate` — foi medido e **estava errado**: a perna de transferência
tinha taxa nula, então o valor não sumia, ele ficava preso na fábrica que já não tinha o
produto."* (`docs/insights.md:2231-2238`)

**O que mudou.** *"`recordProduction` passa a ser o autor da média do produto, e a
migração **0025** põe o espelho no servidor pelo mesmo cálculo, com `item_costs`
continuando fora da fila — cada lado conclui, ninguém manda o número pronto. A `db:verify`
ganhou a garantia que faltava: as duas implementações, independentes, chegam a
**68,4224** para o mesmo picolé. Provado quebrando: com o gatilho apontando para outro
`kind`, a checagem falha com 'o servidor não sabe quanto vale o que o tacho fez'."*
(`docs/insights.md:2240-2246`) Confirmado na árvore:
`supabase/migrations/0025_what_the_kettle_makes_is_worth_something.sql`.

**E o detalhe de dinheiro que a capa do projeto previa.** *"Reaproveitar o evento de compra
para a corrida custou visivelmente: ele fala de nota, e nota tem centavo inteiro. A
primeira corrida de 500 unidades saía com média **64,996** contra um custo congelado de
**64,99686** — dois números para o mesmo picolé no dia em que ele nasceu. Taxa não é valor
final e não se arredonda: nasceu o **`blendRate`**."* (`docs/insights.md:2246-2248`)
Confirmado na árvore: `blendRate` é definida em `src/domain/cost.ts` e chamada em
`src/data/repository.ts:1580` e `src/data/repository.ts:4386` — **implementada e chamada
pelo caminho de escrita**; o comentário em `src/data/repository.ts:1578` registra que ela
*"existe por causa desses oito décimos"*.

#### B21 — 4/9: a decisão estava certa e o número estava errado — era o plural (`docs/insights.md:3128-3160`)

**O que se viu.** `stockAgainstOrders` (a conta de quanto dá para prometer) tinha decisão
escrita no docblock: *"o saldo lido é o do LUGAR de onde a carga sai, não o da empresa —
mil picolés espalhados em quatro lojas não atendem o cliente que pediu mil na fábrica"*.
*"Achei a decisão antes de chamar aquilo de defeito, como a capa manda. A decisão está
certa. **O defeito era o singular**: a consulta lia `defaultLocationId`, um lugar só."*
(`docs/insights.md:3130-3136`)

**O efeito.** *"Numa fábrica de picolés o produto vai para a câmara fria no dia seguinte
ao de produzir. Então a conta dizia 'não há nada para prometer' **com o freezer cheio** —
e a tela de anotar pedido, que usa essa conta para avisar excesso, ficava muda justamente
quando a conta decide se um pedido pode ser aceito."* (`docs/insights.md:3138-3141`)

**A regra que fica.** *"Procurar a decisão não é o fim da busca, é o começo. Achar a
decisão escrita responde *'isto é intencional?'* e não responde *'isto continua verdade?'*.
Aquela frase foi escrita quando existia um lugar só, e naquele mundo 'o lugar de onde a
carga sai' e 'o lugar padrão' eram sinônimos. A câmara fria desfez o sinônimo e a frase
continuou lendo igual — decisão certa, implementação envelhecida, e nada no texto
avisando."* (`docs/insights.md:3143-3148`)

**A busca que sai daí, transcrita porque é reutilizável.** *"**Decisão escrita no singular
sobre coisa que passou a existir no plural.** `ensureLocation` cria um lugar cujo id é o
`company_id` — todo lugar do código que usa esse id como se fosse 'a fábrica' é candidato.
Foram três hoje: o aviso de validade, a contagem, e esta."*
(`docs/insights.md:3150-3153`)

**O que mudou.** *"A consulta soma todas as salas nossas, e a régua de quais são nossas
saiu de três grafias para uma: `INTERNAL_PLACE_KINDS` e `receivesCargo` em
`src/domain/ledger.ts`, lidas pelas duas telas que separavam sala de destino à mão. O SQL
não importa constante, então uma guarda em `src/layers.test.ts` lê os dois lados e compara
— divergir ali é prometer mercadoria que está numa loja."*
(`docs/insights.md:3155-3160`)

Confirmado na árvore, com os valores exatos do conjunto:
`export const INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room'] as const;`
(`src/domain/ledger.ts:68`) e `export function receivesCargo(kind: string): boolean`
(`src/domain/ledger.ts:71`). A guarda que compara o SQL com a constante está em
`src/layers.test.ts:395-396`, com a mensagem de falha *"o SQL e `INTERNAL_PLACE_KINDS`
discordam sobre quais salas são nossas"*; o docblock em `src/layers.test.ts:373-374` diz
que a constante é lida por duas telas — *"o tom da linha em `app/places.tsx` e o destino
possível de um pedido em `app/orders/new.tsx`, pelo `receivesCargo`"*. Estado:
**implementado e chamado por tela**.

#### B22 — 4/9: três telas liam a empresa e escreviam numa sala, e o padrão tem nome (`docs/insights.md:3161-3200`)

**O que se viu.** *"Terceiro achado do dia com a mesma forma, e o terceiro foi encontrado
**procurando pela forma**, não esbarrando nela"* — usando a frase do item anterior
(`docs/insights.md:3163-3166`).

As três, na tabela transcrita do registro (`docs/insights.md:3170-3175`):

| tela | mostrava | escrevia | o que acontecia |
|---|---|---|---|
| contagem do insumo | total da empresa | almoxarifado | **−38.000 g** na fábrica por contar a câmara |
| conta de prometer | — | — | *"nada para prometer"* com o freezer cheio |
| produção | total da empresa | almoxarifado | toda corrida recusada, **em inglês** |

**O que elas têm em comum não é o bug, é a origem.** *"`ensureLocation` cria um lugar cujo
id É o `company_id` — decisão boa e documentada, porque foi assim que todo movimento já
gravado foi carimbado. O efeito colateral é que, enquanto houve um lugar só, 'o total da
empresa' e 'a sala padrão' foram **o mesmo número**, e nenhum teste podia distinguir uma
leitura da outra. Os dois sentidos moram no mesmo id, então o código que confundiu os dois
não tinha como se delatar."* (`docs/insights.md:3177-3183`)

**A regra que fica.** *"Id que significa duas coisas é dívida com data de vencimento. O
vencimento chega no dia em que o segundo lugar é cadastrado — e ele chega em silêncio,
porque o dia em que o dono cria a câmara fria não é um dia de commit. A busca por 'quem
usa `company_id` como se fosse o lugar' achou três em uma tarde e é para ser repetida a
cada vez que uma coluna dessas ganhar um segundo valor possível."*
(`docs/insights.md:3185-3189`)

**O que mudou.** *"As três consertadas, cada uma com o guarda da sua forma: duas de fonte
em `src/layers.test.ts` (a contagem, e o piso da produção) e uma comparação de listas (o
SQL contra `INTERNAL_PLACE_KINDS`). Guarda de fonte porque nas três o defeito não estava
em função nenhuma: estava em duas leituras diferentes da mesma pergunta dentro de uma
tela, que é o único lugar onde teste de unidade é cego por construção."*
(`docs/insights.md:3191-3196`)

**E o que NÃO foi consertado, dito em vez de omitido.** *"A produção agora impede e diz
onde o insumo está, mas **trazer a polpa da câmara para o almoxarifado não tem como ser
registrado** — a tela de transferir sai sempre da fábrica, e o caminho de volta grava
`return`, que é notícia sobre a loja. Isso é decisão de dono sobre a F2, com as duas formas
escritas em `docs/roadmap.md`."* (`docs/insights.md:3198-3200`) Estado: **lacuna aberta,
decisão de dono pendente**.

#### B23 — 4/9: o serializador que ninguém chama, e a severidade que caiu com isso (`docs/insights.md:3201-3233`)

**O que se viu.** *"O achado 8 da auditoria dizia que apagar uma área menor **trava a fila
para sempre**. Fui consertar e, antes de escrever a varredura, procurei quem levanta a
exceção: `serialize` (`src/sync/serialize.ts:398`) é o único lugar que diz *'the row is
gone from the device'*. **`serialize` não tem chamador de produção** — só testes. O motor
recebe o transporte injetado (`engine.ts:76`) e nenhum transporte existe ainda."*
(`docs/insights.md:3203-3208`)

Estado confirmado hoje na árvore: `serialize(` aparece só em
`src/data/repository.test.ts:2693`, `src/data/repository.test.ts:2743`,
`src/sync/agreement.test.ts:131` e `src/sync/agreement.test.ts:284`; o motor
(`src/sync/engine.ts:76`, `transport: Transport`) é importado apenas por
`src/sync/sync.test.ts:9`. **Implementado sem chamador de produção — segue assim.**

**A consequência para o texto da auditoria.** *"Então a frase 'trava a fila para sempre' é
futuro, não presente. O que existe hoje é a fila crescendo com entradas que nunca poderão
subir, e a tela de Ajustes contando essas entradas como 'esperando' — um número que não vai
baixar nunca. A mina fica armada para o dia em que o transporte existir, e é aí que ela
explode: no dia do primeiro cliente de verdade."* (`docs/insights.md:3210-3214`)

**A regra que fica.** *"Severidade se confere no chamador, não no arquivo do defeito. Eu ia
escrever 'crítica, trava a fila' no commit. A verificação levou um `grep` e mudou a frase —
e mudar a frase é o trabalho: a auditoria é lida pelo dono, que decide o que entra em
produção com base nessa palavra. Achado real com severidade inflada gasta a confiança dele
do mesmo jeito que alerta inventado."* (`docs/insights.md:3216-3220`)

**E é o quarto P1 do dia**, com a lista transcrita (`docs/insights.md:3222-3228`):

| peça | estado no registro |
|---|---|
| `balanceByLocation` | estava sem chamador — *"agora tem"* |
| `serialize` | *"segue sem"* |
| `item_costs` / `item_cost_history` | *"com ramo dedicado no serializador e nenhum `enqueue` que os produza"* |
| `forgetSentBefore` | *"só chamada por teste"* — já listada nos médios da auditoria |

*"O portão P1 do `CLAUDE.md` existe justamente para isso, e ele só vale para código NOVO:
quatro casos antigos seguem de pé, e nenhum número de fase os pegou."*
(`docs/insights.md:3226-3228`) Confirmado hoje: `forgetSentBefore` está em
`src/data/outbox.ts:139` e só aparece em `src/data/repository.test.ts:69,774` —
**implementado sem chamador de produção**.

**O que mudou.** *"`forgetOrphans` em `src/data/outbox.ts`, chamada dentro da transação de
apagar, com a lista de tabelas da fila conferida contra todo `enqueue` do repositório **e**
contra o esquema — as duas formas de errar que não aparecem em tempo de compilação. E a
auditoria ganhou a correção, escrita nela: o que era 'trava' é 'vai travar'."*
(`docs/insights.md:3230-3233`) Confirmado: `forgetOrphans` em `src/data/outbox.ts:193`,
chamada em `src/data/repository.ts:3496` — **implementada e chamada pelo caminho de
apagar**.

#### B24 — 4/9: a quinta aparição, e a primeira achada procurando a família (`docs/insights.md:3410-3444`)

**O que se viu.** *"Quatro migrações deste repositório consertam o mesmo defeito: tabela
que a fila do aparelho envia com `on conflict (id) do update` e que não tem política de
update no servidor. A **0015** (compras), a **0020** (lotes), a **0027** (pedidos —
política existia, com a capacidade errada), a **0030** (o lugar padrão). Cada uma foi
encontrada por esbarrão: um CI vermelho, uma auditoria, uma queixa."*
(`docs/insights.md:3412-3417`)

*"Hoje, indo consertar o `recorded_by` do pedido, listei **todas** as tabelas com
`recorded_by` e **todas** as políticas de update do esquema, em duas linhas de `grep`.
`readings` apareceu com política de leitura, política de insert, e nada mais."*
(`docs/insights.md:3419-3421`)

**E é a pior das cinco.** *"A leitura da câmara é a escrita com maior chance de subir duas
vezes em todo o aplicativo: ela é anotada dentro da câmara fria, a **−18 °C**, onde o sinal
não chega — o app foi desenhado inteiro em volta disso. A escrita mais propensa a reenvio
era a única sem direito a reenviar, e o motor para a fila no primeiro buraco de propósito:
tudo o que a fábrica gravasse depois ficava preso atrás de uma leitura de temperatura."*
(`docs/insights.md:3423-3428`)

**Por que a barra não pegou.** *"A checagem 9 — a que sobe a fila duas vezes pela
capacidade mínima de cada papel — replica **um `orders`, e só**. A checagem existia, a forma
do defeito era conhecida, e a cobertura era de uma tabela."*
(`docs/insights.md:3430-3433`)

**A regra que fica.** *"Erro que apareceu quatro vezes não se conserta na quinta — se
varre. O custo de listar a família inteira foi de dois `grep`; o de esperar a quinta
aparição foi quatro migrações e uma auditoria. Quando um defeito volta com cara nova, a
pergunta deixa de ser 'onde está este?' e passa a ser **'qual é a lista completa de lugares
onde ele caberia, e o que prova que cada um está coberto?'**"*
(`docs/insights.md:3435-3439`)

**O que mudou.** *"A **0031** dá a `readings` política de reenvio e um gatilho que congela o
que foi visto; a **0032** congela `recorded_by` do pedido para todos, inclusive quem aprova.
Duas checagens novas no `db:verify` (**12 e 13**), as duas escritas **antes** das migrações e
vistas reprovando: a 12 com `new row violates row-level security policy`, a 13 com o autor
do pedido trocado por outro id."* (`docs/insights.md:3441-3444`)

Confirmado na árvore: `supabase/migrations/0031_a_reading_can_be_sent_twice.sql`,
`supabase/migrations/0032_who_ordered_it_never_changes.sql`, e as duas checagens em
`scripts/verify-migrations.sh:812` (*"check 12: a leitura da câmara sobe duas vezes, e a
segunda não reescreve nada"*) e `scripts/verify-migrations.sh:849` (*"check 13: quem aprova
um pedido não reescreve quem o anotou"*). O repositório tem hoje **32 migrações**
(`supabase/migrations/`).

---

### 31.4 Peças sem chamador, chamadores sem uso, e caminhos armados

#### B25 — 4/9: a promessa estava no docblock, e o chamador não existia (`docs/insights.md:2470-2496`)

**O que se viu.** *"`explodeRequirements` carrega esta frase desde que foi escrita: *'This
is the query behind the shopping list that writes itself'*. A lista de compras não existia.
O que existia era a mesma função respondendo *'posso fazer esta corrida?'* para um produto —
e o docblock prometia a pergunta invertida, para vários produtos, que ninguém tinha
escrito."* (`docs/insights.md:2472-2477`)

**O custo real da construção.** *"Somar vários produtos custou **zero linha nova de
aritmética**: a função já acumula no mapa que recebe, então um plano é chamá-la de novo com
o mesmo mapa. O delta real era o outro: devolver `missing` em vez de `needed`. *'Precisa de
54.000 g de polpa'* não decide nada para quem tem 40.000 na prateleira; *'faltam 14.000'*
decide."* (`docs/insights.md:2479-2484`)

**O que quase ficou de fora, e é o mais instrutivo.** *"A receita não conhece o palito — ele
é consumo por unidade produzida, não por tacho. Uma lista de compras que só explode a receita
esquece exatamente o item que a fábrica mais gasta, e é o mesmo defeito que o custo congelado
já teve neste repositório. A diferença é que aqui prever a unidade é **legítimo**: isto é
simulação, e simulação pode prever. O custo congelado é que não pode, porque ele grava o que
aconteceu. Duas contas parecidas com permissões opostas sobre o mesmo verbo."*
(`docs/insights.md:2486-2492`)

**A regra que fica.** *"Docblock que promete um chamador é dívida com juros — ele descreve o
que a função *poderia* responder, e quem lê acredita que alguém já pergunta. Procurar promessa
sem chamador é a busca mais barata deste repositório: `grep` no docblock, e a pergunta 'quem
chama isto?'"* (`docs/insights.md:2494-2496`)

Estado confirmado na árvore, com a assinatura e o tipo de retorno transcritos:
`export function shoppingList(plan: readonly PlanLine[], recipes: Readonly<Record<string, Recipe>>, onHand: ReadonlyMap<string, number>): ShoppingLine[]`
(`src/domain/recipe.ts:360-364`), devolvendo `{ itemId, needed, held, missing }` com
`missing: Math.max(0, amount - held)` (`src/domain/recipe.ts:387-390`) e ordenação
`b.missing - a.missing` (`src/domain/recipe.ts:391`). Ela é chamada por
`src/assistant/skills.ts:1025` — **implementada e alcançável pelo assistente**. O docblock
transcreve a fronteira de camada: *"Devolve fato, nunca frase: quantidade pedida, quantidade
em casa e a diferença. Quem escreve 'compre dois sacos de açúcar' é a tela"*
(`src/domain/recipe.ts:352-355`), e o cálculo do palito: as unidades previstas são
`(recipe.yieldAmount * (1 - recipe.lossFraction) * line.batches) / perUnit`, e cada
embalagem entra com `wrap.quantityPerUnit * units` (`src/domain/recipe.ts:379-384`).

#### B26 — 4/9: a resposta anterior a "nada chama isto" foi escrever teste (`docs/insights.md:2587-2632`)

**O que se viu.** *"O `CLAUDE.md` nomeia, entre as peças sem chamador, '`balanceAt` e
`daysOfCover` chamados só por teste'. Fui conferir os três exemplos que ele lista. Dois se
fecharam sozinhos com o uso — `assistant_phrase` ganhou escritor, e `Draft.kind` ganhou leitor
**hoje**, no conserto do 'Lançado.' que não lançava nada. `balanceAt` continuava lá. E puxando
o fio, não era uma: eram **quatro** funções exportadas em `src/domain/ledger.ts` sem nenhum
chamador fora de teste — `balanceOf`, `balanceAt`, `lotsPresentDuring` e `buildReversal`."*
(`docs/insights.md:2589-2597`)

**Por que elas nunca teriam chamador.** *"Não é esquecimento, é *forma*: as quatro dobram
sobre `Movement[]` em memória, e o aplicativo **nunca tem os movimentos em memória** — ele tem
SQLite. Cada pergunta já é respondida em SQL, onde os dados estão: `stockByPlace`,
`balanceByLocation` e `lotsInStock` somam `quantity_base_units`, e `reverseGroup` escreve o
estorno negando a quantidade na própria instrução. Carregar anos de movimento num celular para
dobrar em memória seria a forma errada mesmo se alguém quisesse."*
(`docs/insights.md:2599-2605`)

*"`buildReversal` era o caso caro: **dois autores para o que é um estorno**, um em TypeScript
que ninguém roda e um em SQL que roda. Mudar a regra na cópia bonita não faria nada."*
(`docs/insights.md:2607-2609`)

**E o que a sessão anterior fez com o mesmo achado.** *"O docblock do teste diz, com todas as
letras: *'The two ledger queries nothing was calling and nothing was checking… both were
exported with a docblock and never run.'* Alguém viu, e respondeu **escrevendo teste**. Os
testes eram bons e corretos — e não tornaram nada alcançável: tornaram a morte mais difícil de
ver. Depois disso, uma mutação curada foi acrescentada por cima, prometendo que quebrar o
limite faria *'a excursão de temperatura acusar o lote errado'* — numa tela que não existe. O
portão que diz 'a suíte morde onde promete morder' estava mordendo uma regra sem efeito em
produção."* (`docs/insights.md:2611-2619`)

**O que mudou.** *"As quatro saíram, com o motivo escrito no lugar delas. O vocabulário fica, e
fica ganho: `src/sync/agreement.test.ts` confere o tipo `Movement` nos dois sentidos contra o
esquema do servidor e o do aparelho — esse é um teste que compara *duas fontes de verdade*, não
um que exercita código parado. A pergunta que o docblock da fundação promete — 'o que estava
dentro da câmara às 03:12?' — virou **item 6 do roadmap**, com a consulta que ela pede: SQL com
corte no tempo, e não a dobra que morreu."* (`docs/insights.md:2621-2628`)

Confirmado na árvore: `src/domain/ledger.ts` hoje exporta `MovementKind`, `LossReason`,
`ControlPost`, `INTERNAL_PLACE_KINDS`, `receivesCargo`, o tipo `Movement` e `daysOfCover`
(`src/domain/ledger.ts:19,46,53,68,71,75,172`) — as quatro dobras citadas não estão mais lá.
`daysOfCover` **ganhou chamador de produção**: `src/data/repository.ts:3843`
(`const daysLeft = daysOfCover(r.on_hand, dailyOutflow)`). `src/sync/agreement.test.ts` existe
com 436 linhas.

**A regra que fica.** *"Quando nada chama uma peça, há três respostas honestas — trazer o
chamador, apagar a peça, ou registrar a fronteira com quem vai chamá-la. **Escrever teste não é
uma delas.** Teste sobre peça inalcançável não prova capacidade: prova que a peça faz o que ela
faz, e passa a proteger uma promessa que ninguém pode cobrar."*
(`docs/insights.md:2630-2632`)

#### B27 — 4/9: a tela lia vinte lançamentos para usar a data de um (`docs/insights.md:3273-3305`)

**O que se viu.** *"Ao dar grupo à compra, à contagem e à perda, precisei da lista de
lançamentos na tela do insumo — e ela **já estava lá**. `app/inputs/[id].tsx` chamava
`itemMovements(...)` (vinte linhas, com tipo, quantidade, custo congelado e data) e usava
exatamente uma coisa: a data do último ajuste, para escrever 'conferido em 3/9'. As outras
dezenove linhas eram lidas do banco, montadas em objeto, guardadas no estado, e descartadas na
renderização."* (`docs/insights.md:3275-3282`)

**É o P1 pelo avesso.** *"O portão deste projeto pergunta *'quem chama isto no mesmo commit?'*
e pega o export sem chamador — `balanceAt`, `daysOfCover`, `assistant_phrase` com índice e
nenhuma escrita. Este é o outro lado da mesma doença: **o chamador sem uso**. Ninguém o pega,
porque o código *parece* justificado — tem chamador, roda, e o dado até aparece na tela (uma
data). O que não existe é a razão de ler vinte."* (`docs/insights.md:3284-3289`)

*"E o custo não é a consulta: é que a informação estava a um `map` de distância da tela e
ninguém a via. A fundação mais forte do projeto — corrige-se por estorno, nunca por exclusão —
estava sem porta para **três dos sete caminhos de escrita** justamente na tela que já tinha a
lista dos três na mão."* (`docs/insights.md:3291-3294`)

**A regra que fica.** *"Dado lido e não mostrado é pergunta, não sobra. Ou a tela devia mostrar
(e é uma dívida de interface), ou não devia ler (e é uma consulta a menos). As duas saídas são
baratas; ficar no meio é o único jeito de pagar as duas. Onde procurar mais deles: `useQuery`
que devolve lista e `.find(...)` uma vez só."* (`docs/insights.md:3296-3299`)

**O que mudou.** *"O cartão 'Últimos lançamentos' mostra os oito últimos, cada um com o que é em
uma palavra (`t.movement`, dicionário novo nos três idiomas), e desfazer no toque — com a conta
aberta antes de escrever, o que volta e o que sai, e a recusa explicando o caminho quando não
cabe. A compra passa a carregar a NOTA como grupo (não a linha: no dia em que uma nota tiver
duas linhas, o grupo por linha desfaria metade dela), e a contagem e a perda carregam a própria
linha."* (`docs/insights.md:3301-3305`)

#### B28 — 4/9: o caminho de publicação que ninguém usa continua armado, e o conserto foi só do gatilho (`docs/insights.md:2668-2731`)

**O que se viu.** *"Fui conferir de que commit saiu o `apk-0.8.0` — nove commits atrás,
`c32f96f`, e desde então entraram quatro coisas que aparecem na tela. Conferindo, dei com dois
caminhos de publicação vivos ao mesmo tempo"* (`docs/insights.md:2670-2673`):

| workflow | o que faz | histórico |
|---|---|---|
| `build-apk.yml` | compila **neste repositório** (`expo prebuild` + gradle, arm64, **49 MB**) | publicou de `apk-0.2.0` a `apk-0.8.0`, **sete vezes** |
| `release-apk.yml` | **baixa um artefato pronto da Expo** e anexa ao release | última publicação legítima: `apk-0.1.0`, em 1 de setembro |

*"O segundo não tem chamador desde então. Mas ele não é código morto — é código **armado**, e o
docblock dele descreve com todas as letras a falha que ele próprio ainda produz."*
(`docs/insights.md:2679-2681`)

**O que aconteceria hoje, conferido passo a passo.** *"`.github/apk-release.txt` não é tocado
desde `f4ca1ce`: ele aponta para um artefato da Expo compilado de `5703790` — **177 commits
atrás** — e traz `# commit: 5703790`. O workflow calcula a tag a partir do `app.json`, que nesta
branch diz 0.9.0 mas dizia 0.8.0 até agora. Disparar 'Publicar o APK' com esta branch escolhida
fazia: `gh release create apk-0.8.0` falhar (a tag existe), cair no
`|| gh release upload --clobber`, e **anexar um APK de 110 MiB de 177 commits atrás dentro do
release `apk-0.8.0`** — ao lado do bom, sob uma nota que diz 'Compilado de `c32f96f`'."*
(`docs/insights.md:2683-2691`)

*"É exatamente o defeito que o docblock dele diz ter consertado: *'o pior tipo de defeito de
entrega: dois arquivos sob a mesma tag, com códigos diferentes'*. O conserto de 1 de setembro
trocou o gatilho de `pull_request` para `workflow_dispatch` e resolveu a **republicação
automática**. Não resolveu o ponteiro velho: no dia em que alguém dispara à mão, o resultado é
o mesmo. E é pior que dois arquivos — **as duas assinaturas são chaves diferentes, então quem
baixar o maior não consegue instalar por cima e perde os dados ao desinstalar**."*
(`docs/insights.md:2693-2699`)

**Por que passou.** *"O `main` falha seguro por acidente, não por desenho: lá o pedido não tem a
linha `# commit:`, e a checagem que exige essa linha mata o passo. Quem for conferir 'isso é
perigoso?' olhando o `main` vê um workflow que recusa rodar, e conclui que está protegido. A
branch é que tem a linha."* (`docs/insights.md:2701-2705`)

**A resposta certa era uma das três, e não foi teste.** *"Aqui é apagar: o caminho da Expo foi
superado pelo que compila no repositório, o artefato dele está velho, e ressuscitá-lo exigiria
uma build nova da Expo, que exige o token — que é o que precisa ser revogado."*
(`docs/insights.md:2707-2712`)

**E isso fechou uma pendência parada.** *"O `EXPO_TOKEN` vazado precisa ser revogado desde 3 de
setembro, e a pergunta implícita era o que quebra quando ele morrer. A resposta, medida:
**nada.** Depois desta remoção não sobra uma ocorrência de `EXPO_TOKEN`, `eas build` ou
`expo.dev/artifacts` no repositório — o `build-apk.yml` não tem conta na Expo, só
`npx expo prebuild` e gradle. Revogar o token passou a custar zero, e isso muda o recado ao
dono: não é um chore, é uma ação de graça."* (`docs/insights.md:2714-2720`)

**O que mudou.** *"`.github/workflows/release-apk.yml` e `.github/apk-release.txt` apagados;
`app.json` em **0.9.0**, e o instalador novo sai do HEAD com as quatro coisas de hoje que
aparecem na tela — a ficha na etiqueta do lote, a dica de quanto dá para prometer no primeiro
pedido, a lista de compras no assistente, e os lotes expostos na câmara fora da faixa."*
(`docs/insights.md:2722-2726`) Confirmado hoje: `.github/workflows/release-apk.yml` e
`.github/apk-release.txt` **não existem**; `.github/workflows/build-apk.yml` existe com 354
linhas.

**A família, para nomear.** *"**Consertar o gatilho e deixar o alvo.** O erro tinha duas metades
— quando roda, e o que roda — e o conserto tratou a primeira como se fosse a coisa toda, com um
docblock longo por cima afirmando o conserto. É a mesma forma dos rótulos de hoje: o texto ao
lado descreve um estado que o código não tem mais."* (`docs/insights.md:2728-2731`)

---

### 31.5 Telas, rótulos e a Lei da Inteligência

#### B29 — 3/9: a loja que o sistema só via depois da primeira carga (`docs/insights.md:1920-1950`)

**O que se viu.** *"Construindo a ficha de acordo, a tela de lugares mostrou uma coisa que não
tinha nada a ver com o acordo: ela lista `stockByPlace`, e essa consulta começa em `movements`.
Um lugar sem movimento não existe para ela. Uma loja cadastrada hoje de manhã só aparece na lista
depois que alguém manda a primeira carga para lá."* (`docs/insights.md:1922-1926`)

**Por que importa.** *"A ordem real do trabalho é a inversa: cadastra a loja, combina o dia de
entrega e o telefone, e **só então** manda a primeira carga. Durante toda essa janela a loja está
invisível na única tela que a lista — e o menu chama essa tela de 'Lojas e clientes'. O efeito
previsível não é o usuário reclamar: **é ele cadastrar a mesma loja de novo, e a fábrica passar a
ter duas 'Loja Centro' com saldo dividido entre elas.** Nenhum alerta acusaria isso, porque duas
lojas com nomes parecidos são um cadastro perfeitamente válido."* (`docs/insights.md:1928-1935`)

**O que mudou.** *"A tela passou a listar **lugares**, com o saldo encaixado quando existe: quem
não tem nada mostra 'nada aqui ainda' em vez de sumir. É a mesma distinção que o projeto já fez em
outro canto — **a consulta que responde 'quanto tem' não é a que responde 'quem existe'**, e usar
uma no lugar da outra some com o que ainda não se moveu."* (`docs/insights.md:1937-1941`)

**E o `mutate` pegou um guarda que era decoração.** *"`agreedOn(days, weekday)` tinha
`if (weekday < 0 || weekday > 6) return false` e apagar essa linha não quebrava teste nenhum. O
motivo não era teste fraco: indexar fora da tabela de bits devolve `undefined`, que vira zero na
conta e responde 'não combinado' sozinho — o guarda não mudava comportamento nenhum. Virou
`RangeError`, porque um oitavo dia é bug de quem chamou e um 'não' educado esconde o bug atrás de
uma frase plausível na tela."* (`docs/insights.md:1943-1950`) Confirmado na árvore:
`export function agreedOn(days: number, weekday: number): boolean`
(`src/domain/agreement.ts:37`), usada por `daysUntilNextDelivery`
(`src/domain/agreement.ts:61`) — **implementada e chamada**.

#### B30 — 4/9: "peça sem dado não aparece" apagou a porta de duas telas (`docs/insights.md:2282-2303`)

**O que se viu.** *"O CI reprovou uma checagem que parecia frase: a aba de relatórios não dizia
mais 'o que cada unidade custa'. Não era a frase. Ao virar briefing, a tela passou a mostrar cartão
só para o assunto que TEM número — e com isso **Receitas e Perdas ficaram sem caminho nenhum** numa
instalação nova. **Perdas não aparece em nenhum outro lugar do aplicativo.**"*
(`docs/insights.md:2284-2289`)

**Por que importa.** *"A regra é boa e é do dono: cartão dizendo zero é alerta inventado. Mas eu
apliquei larga demais, num lugar onde o cartão fazia dois trabalhos — dizer o número **e** ser a
porta. Regra certa, fronteira errada, e o resultado é pior que o defeito que ela evita: um alerta
inventado se ignora, **uma tela inalcançável não existe**."* (`docs/insights.md:2291-2295`)

**O que mudou.** *"Cartão para o que tem o que dizer, `ListRow` para o resto. E a fronteira ficou
escrita no briefing das telas que ainda vão ser reescritas, para o mesmo erro não se multiplicar
por vinte."* (`docs/insights.md:2297-2299`)

**A regra que fica.** *"Antes de esconder alguma coisa por não ter dado, pergunte se ela também é
caminho. Esconder o que não informa é higiene; esconder o que navega é amputação."*
(`docs/insights.md:2301-2303`)

#### B31 — 4/9: o rótulo e o que está embaixo dele discordando, três vezes (`docs/insights.md:2304-2338`)

**O que se viu.** Três telas, no mesmo dia, o mesmo defeito com três caras
(`docs/insights.md:2306-2315`):

| tela | o rótulo dizia | o que estava embaixo |
|---|---|---|
| almoxarifado | **"4 unidades"** | contava quatro *itens*, ao lado de um saco com **69.566 g** dentro |
| estante de receitas | **"2 receitas"** | uma lista de *uma* — *"a outra estava no cartão acima"* |
| ficha | **"18.000 · 77% do lote"** | sem unidade: *"dezoito mil gramas e dezoito mil unidades são coisas diferentes na mesma página"* |

*"Nenhum dos três é erro de cálculo. Os três números estão certos; o que está errado é **o que a
palavra ao lado afirma sobre eles**. É a família de defeito mais fácil de escrever e a mais difícil
de ver relendo código, porque o código está certo — `shown.length`, `rows.length`, `line.quantity`
são exatamente o que o autor quis."* (`docs/insights.md:2317-2322`)

**Por que os três apareceram naquele dia.** *"Não foi a reescrita que os criou — os três já estavam
lá, e dois são anteriores a ela. O que mudou foi o instrumento: `npm run shot` põe a tela na frente
do olho, e uma frase que discorda do que está abaixo dela **só se vê olhando**. Nenhum teste
unitário reclama de '4 unidades', porque o número é quatro mesmo."*
(`docs/insights.md:2324-2329`)

**O que isso diz sobre guardas.** *"A tentação é escrever um script. Não há script: 'o rótulo
concorda com a lista embaixo dele?' não é uma propriedade do código, é uma propriedade do
*significado*."* (`docs/insights.md:2331-2334`) — afirmação **corrigida pelo próprio registro
seguinte** (item B32).

**Regra prática.** *"Ao ler uma tela pronta, leia o rótulo em voz alta como uma frase completa e
pergunte se ela é verdade sobre o que está logo abaixo. '4 unidades ao custo médio de cada um' era
falso, e ficou seis meses no aplicativo."* (`docs/insights.md:2336-2338`)

#### B32 — 4/9: a mesma família, trinta e uma vezes (`docs/insights.md:2339-2395`)

**O que se viu.** *"O registro de cima disse que 'não há script' para este defeito e que a defesa é
olhar. Metade estava certa. Uma varredura dirigida — uma leitura por tela, com uma pergunta só (*o
rótulo é verdade sobre o que está imediatamente abaixo dele?*) e a exigência de provar cada achado
no código antes de chamá-lo de defeito — devolveu **trinta achados em treze telas**. Conferi os
trinta um por um contra o código: **os trinta se sustentaram**, e procurando o mesmo defeito onde a
varredura não olhou apareceu **o trigésimo primeiro, na capa**, que é a tela mais vista do
aplicativo."* (`docs/insights.md:2341-2350`)

O trigésimo primeiro, transcrito: *"`formatPacked` era chamado justamente para o item **sem** camada
de caixa, e para esse item a única faixa é `unit` — então seis quilos de açúcar saíam na capa como
**'6.000 unidades de Açúcar cristal'**. A embalagem já vinha na consulta; o que faltava era a
unidade de uso, uma coluna ao lado."* (`docs/insights.md:2352-2355`)

Os que mais ensinam, *"porque nenhum é erro de conta"* (`docs/insights.md:2357-2376`):

| defeito | mecanismo |
|---|---|
| **"0% acima de ontem"** com 480 e 480 na tela | *"o selo tinha dois estados e o empate caía em 'acima'. A capa já reconhecia o terceiro estado; a aba não. E o arredondamento ampliava — 4.802 contra 4.800 também imprimia 0%."* |
| **"Primeira carga registrada."** | decidida por `ontem === 0`: *"numa fábrica que entrega há dois anos e não entregou no domingo, o cartão de segunda dizia isso"* |
| **"Cancelar"** em cima de **"Cancelar"** | *"com efeitos opostos, num diálogo cujo assunto é cancelar — e o pedido cancelado sai da lista, sem volta pela tela"* |
| **"Conversão confere"** | *"acendendo sempre que os dois números eram positivos, sem comparar nada: dava para ver 'saco 25 kg', '250 g' e o selo verde juntos — errado por cem vezes, que é o erro que aquela tela existe para impedir"* |
| **"Inclui os dados de exemplo"** | *"aceso pela marca `seeded`, que nunca é apagada: verdadeiro em todo aparelho para sempre"* |
| **"livre hoje: … menos o que já foi prometido para esta data"** | *"com horizonte fixo de sete dias e consulta sem chave: trocar a data não movia o número"* |
| **"POR QUÊ?"** | *"como único rótulo de um campo que carregava quatro conteúdos diferentes — a conta de um número, as opções de uma pergunta, uma instrução e os campos de um rascunho. Só o primeiro é a conta que a Lei 6 manda abrir."* |

**A correção do registro anterior.** *"'Não há script' era verdade sobre *scripts*, e falso sobre
*método*. O que pega este defeito é uma leitura com a pergunta certa e a obrigação de provar — e
isso escala: uma tela por leitor, em paralelo, com verificação adversarial minha depois. O que
**não** escala é reler o próprio código esperando notar; foi assim que os trinta e um ficaram lá."*
(`docs/insights.md:2378-2382`)

**E dois deles quebraram teste que passava pelo motivo errado.** *"Ao mover os exemplos do
assistente de `detail` para `list`, uma asserção continuou verde porque
`(answer.detail ?? []).map(...)` virou string vazia e `doesNotMatch` passa vacuamente. O e2e tinha o
mesmo buraco: `assert.match(tela, /6\.000/)` com a mensagem 'na unidade do item' passava **sem a
unidade existir**. As duas foram consertadas com a contagem primeiro — **asserção de ausência sem
asserção de presença ao lado é asserção que não morde**."* (`docs/insights.md:2384-2389`)

**A regra que fica, com os seis lugares previsíveis onde a família mora**
(`docs/insights.md:2391-2395`): *"o cabeçalho de um grupo de linhas, o selo de dois estados sobre um
fato de três, a frase de estado vazio decidida por uma contagem parcial, a chave de dicionário
reusada de outra tela, o rótulo fixo sobre um cartão que muda de assunto, e a promessa dita fora do
estado em que ela é verdade."*

#### B33 — 4/9: o mesmo defeito reapareceu dentro do conserto de outro (`docs/insights.md:2435-2469`)

**O que se viu.** *"`orderedDemand` passou a partir do produto em vez da linha de pedido, para a
tela de anotar pedido poder dizer quanto está livre **antes** do primeiro pedido existir. O roadmap
trazia o cuidado escrito: 'a capa lê a mesma função, então o commit que mudar o conjunto de linhas
tem de conferir que "produza para os pedidos" não passa a listar produto com demanda zero.'"*
(`docs/insights.md:2437-2443`)

*"O cuidado estava certo e olhava para o lugar errado. Aquela leitura já filtrava por
`requested - onHand > 0` e ficou protegida de graça. Quebraram **duas outras**, e as duas pela mesma
razão: perguntavam pelo **tamanho da lista**"* (`docs/insights.md:2445-2452`):

| leitura | condição | o que passou a acontecer |
|---|---|---|
| cartão de pedidos da capa | `demand.length > 0` | *"passou a dizer 'Pedidos cobertos' numa fábrica que nunca vendeu nada"* |
| convite do primeiro dia | `demand.length === 0` | *"e sumiu"* |

**Por que merece registro.** *"É a mesma família da varredura do mesmo dia — contar uma variável e
nomear outra — e ela reapareceu **dentro do conserto de outra coisa**, escrita por quem tinha acabado
de caçá-la trinta e uma vezes. Não foi desatenção: `demand.length > 0` era uma leitura *correta*
enquanto a consulta partia da linha de pedido. O defeito nasceu no momento em que o significado da
lista mudou, e nada no tipo mudou junto — `Demand[]` continua `Demand[]`."*
(`docs/insights.md:2454-2460`)

**O que pegou.** *"O e2e, em três checagens da capa, na primeira execução depois da mudança. Nenhum
teste unitário reclamou, porque nenhum deles pergunta o que a capa mostra."*
(`docs/insights.md:2462-2464`)

**A regra que fica.** *"Quando uma consulta muda o **conjunto** que devolve — e não o formato —, o
compilador não ajuda e a revisão do diff também não: os chamadores continuam compilando e lendo a
mesma propriedade. O que se procura são as leituras que perguntam `length`, `some` ou `[0]` sobre o
resultado, porque são exatamente as que dependem do conjunto e não do formato. E o teste que pega
isso é o que abre a tela."* (`docs/insights.md:2466-2469`)

#### B34 — 4/9: o alerta que dizia o que mudou e não dizia o que fazer (`docs/insights.md:2633-2667`)

**O que se viu.** *"A câmara fria mostrava o selo *'fora da faixa de −22 a −16'* e parava aí. Das
três perguntas que a Lei da Inteligência exige de toda tela, ela respondia duas — o que é normal (a
faixa) e o que está diferente agora (a leitura) — e deixava a terceira em branco: **qual é a próxima
ação provável**. Quem lê −8 °C precisa saber *quais lotes estavam lá* para ir olhar, e o livro-razão
já sabia."* (`docs/insights.md:2635-2641`)

**A parte que quase saiu errada.** *"A resposta óbvia é listar o que está na câmara **agora**, e ela
é sutilmente falsa. A medição foi às 07:20 e a pessoa abre a tela às 15:00; no meio pode ter saído
carga. O que ficou exposto é o que estava lá *naquela hora* — e é justamente o lote que já viajou que
um recall mais precisa achar. **`occurred_at <= ?` é a diferença inteira entre as duas perguntas**, e
o teste que prova isso é o que separa uma feature de uma decoração: dois lotes na câmara às 07:20, um
sai ao meio-dia, e a resposta das 07:20 continua sendo dois."* (`docs/insights.md:2643-2650`)

**E ela não precisou de sensor.** *"O docblock da fundação promete isso desde a primeira linha — *'a
habilidade de responder "o que estava dentro do freezer às 03:12?"'* — e eu tinha lido essa promessa
como dependente do ESP32 que não existe. Não é: **a leitura digitada na conferência já carrega a
hora.** A pergunta esperava um sensor por hábito de leitura, não por necessidade."*
(`docs/insights.md:2652-2657`)

**A ligação com o achado anterior.** *"Este item nasceu na mesma varredura que matou `balanceAt` e
`lotsPresentDuring` — as duas dobras do domínio que prometiam esta resposta e não podiam entregá-la,
porque dobram sobre `Movement[]` em memória e o aplicativo tem SQLite. Matar a peça e construir a
resposta foram o mesmo trabalho, e é essa a forma correta do 'trazer o chamador': o chamador não usa
o que estava morto, ele usa a forma que funciona."* (`docs/insights.md:2659-2663`)

**A regra que fica.** *"Quando um alerta dá conta de 'o que está diferente agora' mas não de 'qual é
a próxima ação', o dado que falta quase sempre já está no livro-razão — e a pergunta certa costuma
ter um **instante** dentro dela. 'O que está lá' e 'o que estava lá quando aconteceu' parecem a mesma
consulta e não são."* (`docs/insights.md:2665-2667`)

#### B35 — 4/9: a cegueira era do cartão, e tinha de ser da tela (`docs/insights.md:3306-3333`)

**O que se viu.** *"A contagem deste aplicativo é cega de propósito: enquanto ela está aberta, o
saldo esperado sai da tela, porque quem vê o número confere a tela em vez da prateleira — e uma cópia
não se distingue de uma contagem de verdade um mês depois. Isso estava implementado, testado, e
escrito no comentário do cartão."* (`docs/insights.md:3308-3312`)

*"Acrescentei o cartão 'Últimos lançamentos' logo abaixo, e o `e2e` reprovou na primeira execução:
*'the expected quantity was still visible while counting'*. A linha `Compra +50.000 g` de uma compra
recente **é** o número esperado, escrito de outro jeito. Nenhum teste de unidade podia ver isso: cada
cartão está correto sozinho, e a regra é sobre a soma dos dois."* (`docs/insights.md:3314-3319`)

**A regra que fica.** *"Invariante de tela não se guarda dentro de um componente. O cartão da
contagem escondia o próprio número e não tinha como saber do vizinho que nasceu depois — e o vizinho
não tinha como saber que existe uma regra a respeitar. O que protege é a checagem que olha a TELA
INTEIRA, e é por isso que o `e2e` deste projeto lê `document.body.innerText` em vez de consultar
componentes."* (`docs/insights.md:3321-3326`)

**E o aviso sobre crescer telas.** *"Todo cartão novo numa tela com regra de visibilidade é uma
chance de quebrá-la em silêncio. Aqui não foi silencioso porque a checagem existia desde antes — ela
foi escrita quando a contagem cega foi construída, e cobrou a conta hoje, de uma mudança que nem
existia então."* (`docs/insights.md:3328-3331`)

**O que mudou.** *"O cartão de lançamentos desaparece enquanto a contagem está aberta, pela mesma
razão que o saldo desaparece, e o comentário diz isso onde a próxima pessoa vai ler."*
(`docs/insights.md:3332-3333`)

---

### 31.6 Vocabulário chumbado, configuração falsa e formatação

#### B36 — 3/9: o vocabulário estava chumbado, e ninguém tinha visto (`docs/insights.md:1951-1980`)

**O que se viu.** *"O dono perguntou de onde saiu o 'tacho' e por que ele tinha um cartão na capa. A
resposta honesta é que saiu de mim: a receita declara quanto rende de cada vez, a produção precisa de
um multiplicador para descontar insumo, e esse multiplicador ganhou o nome do recipiente de uma
sorveteria. **Vinte e uma ocorrências, nos três idiomas.**"* (`docs/insights.md:1953-1958`)

**Por que importa.** *"A capa deste projeto diz 'nada de regra chumbada de sorvete, nada de nome de
empresa' — e eu chumbei o **vocabulário**, que é a versão mais difícil de enxergar. Uma fábrica de pão
de queijo não tem tacho, e ia ler 'Quantos tachos' no cadastro dela. Pior: o número já era dedutível
(a tela deduz o multiplicador do que saiu), então a palavra existia sem precisar existir."*
(`docs/insights.md:1960-1965`)

**A causa de fundo era de TIPO, não de texto.** *"`Recipe` carregava `yieldAmount` e **não**
`yieldUnit` — a unidade que o dono escolhe no cadastro morria no banco. Sem ela, nenhuma tela tinha
como dizer 'cada vez rende 40 L', e a palavra inventada preencheu o buraco. **Toda vez que uma tela
inventa vocabulário, vale procurar o campo que não chegou até ela.**"*
(`docs/insights.md:1967-1971`)

**O que mudou.** *"A unidade viaja com a receita; a tela fala 'quantas vezes a receita rodou' com a
dica na unidade do cadastro; o widget do tacho saiu do catálogo (era o mesmo assunto da produção ao
vivo, e duas peças para um assunto é a capa competindo consigo mesma); o pulso mudou de casa em vez de
morrer."* (`docs/insights.md:1973-1976`)

**A regra geral que saiu daqui.** *"**Dado disponível não é motivo para existir palavra na tela.** O
cartão do tacho existia porque `openProductionRun` existia. A capa é o que a casa olha de manhã, e
cada peça a mais empurra o resto para baixo."* (`docs/insights.md:1978-1980`)

#### B37 — 3/9: seis opções não são configuração (`docs/insights.md:1981-2002`)

**O que se viu.** *"Construí a hora do aviso como seis chips que eu escolhi: **5, 6, 7, 8, 12, 18**. O
dono cortou em uma frase — 'nem toda fábrica funciona igual' — e tinha razão de um jeito que eu não
tinha visto: **eu chamei de configuração um menu**. A fábrica que começa às 5h30 não estava em nenhuma
das seis."* (`docs/insights.md:1983-1988`)

**Por que importa.** *"A F7 do projeto diz que 'depende de quem usa' vira dado, não pergunta — e eu
obedeci pela metade. Oferecer um conjunto fechado de valores é escolher pelo cliente com uma aparência
de escolha, que é pior que escolher abertamente: o dono não percebe que a decisão foi tomada por ele."*
(`docs/insights.md:1990-1994`)

**O que mudou.** *"`hour` virou `minuteOfDay`, com hora e minuto livres. **Um número só, e não dois
campos no tipo, porque dois abrem a porta para um estado impossível (hora 5, minuto 90)** — a tela junta
antes de gravar."* (`docs/insights.md:1996-1999`) Confirmado na árvore: a leitura valida
`typeof lido.minuteOfDay === 'number' && lido.minuteOfDay >= 0 && lido.minuteOfDay <= 1439`, gravando
`Math.trunc(lido.minuteOfDay)` (`src/data/repository.ts:3948-3952`) — **implementado e persistido**.

**A pergunta que ficou.** *"Onde mais eu ofereci um conjunto fechado achando que era configuração? Os
chips de antecedência (**1, 2, 3, 5, 7, 14**) são o próximo suspeito, e a diferença é que ali o conjunto
é uma sugestão sobre um número de dias — não uma restrição do que existe. Vale rever quando alguém pedir
quatro dias."* (`docs/insights.md:2000-2002`) Estado: **dívida aberta, não consertada**.

#### B38 — 3/9: a fração morreu na tela, não no banco (`docs/insights.md:2003-2018`)

**O que se viu.** *"A primeira leitura de temperatura gravou **−18,4** e a tela mostrou **−18**. O banco
estava certo; `formatQuantity` arredonda, porque foi escrito para quantidade — unidade, grama, caixa —
onde inteiro é o certo."* (`docs/insights.md:2005-2008`)

**Por que importa.** *"É o mesmo defeito de arredondar dinheiro cedo, do outro lado da parede: **o
número dito deixou de ser o número guardado**. Meio grau de freezer é a diferença entre uma câmara boa e
uma que está começando a falhar, e é justamente o que uma série histórica existe para mostrar."*
(`docs/insights.md:2010-2013`)

**O que mudou.** *"A leitura usa `formatTyped` com uma decimal, e o e2e cobra `-18,4` na tela. O achado
maior é a categoria: **todo formatador carrega uma suposição sobre o que é precisão suficiente**, e ela é
invisível até um dado novo passar por ele. Grandeza física é o primeiro dado deste app que não é
contagem."* (`docs/insights.md:2015-2018`) Confirmado na árvore:
`export function formatTyped(value: number, formatting: string, maxDecimals = 4): string`
(`src/domain/number.ts:85`).

#### B39 — 4/9: o fuso chumbado que a auditoria não viu, achado por consertar outra coisa (`docs/insights.md:3369-3391`)

**O que se viu.** *"O achado 11 era sobre idioma: três dicionários completos e nenhum caminho até dois
deles. Ao construir o caminho, `LocaleSettings` cobrou as outras duas peças que moram no mesmo objeto —
moeda e **fuso**. E o fuso estava chumbado em `America/Sao_Paulo`."* (`docs/insights.md:3371-3374`)

**Por que não é enfeite.** *"`localDate(nowIso(), locale.timeZone)` é o que decide a que **dia** pertence
um tacho fechado às 22h, e essa data vai **impressa na etiqueta do lote**. Uma fábrica em Manaus (uma hora
atrás de São Paulo) lançava o tacho das 23h como produção do dia seguinte, todos os dias, com o papel na
caixa dizendo o dia errado. **Dez auditores não viram, eu não vi ao ler o achado, e ele apareceu porque o
conserto de um pediu o objeto inteiro.**"* (`docs/insights.md:3376-3381`)

Confirmado na árvore: `LocaleSettings` tem quatro campos — `language`, `formatting` (*"BCP 47 tag used for
number and date formatting"*), `currency` (*"ISO 4217"*) e `timeZone` (`src/i18n/index.ts:16-23`);
`localDate(atIso: string, timeZone: string, days = 0)` está em `src/domain/day.ts:37`; e a leitura do que a
empresa gravou hoje aceita o fuso só quando ele tem barra —
`stored.timeZone?.includes('/') ? stored.timeZone : padrao.timeZone` (`src/i18n/company.ts:66`), com os
casos fixados em `src/i18n/i18n.test.ts:167-168` (`GMT-3` cai no padrão, `America/Manaus` passa).

**A regra que fica.** *"O tipo é uma lista de perguntas, e consertar um campo dele obriga a olhar os
vizinhos. `LocaleSettings` tem quatro campos; o achado falava de um; dois estavam errados. Um objeto de
configuração com um campo chumbado costuma ter mais de um — quem chumbou o primeiro estava com pressa, e a
pressa não escolhe um campo só."* (`docs/insights.md:3383-3387`)

**E a segunda metade, sobre a auditoria.** *"Ela olhou o que o dicionário promete e não olhou o que o
`defaultLocale` entrega. As duas coisas estão a uma linha de distância no mesmo arquivo. **Auditoria por
eixo (idioma, dinheiro, sincronização) corta o código em fatias que não são as fatias do defeito.**"*
(`docs/insights.md:3389-3391`)

#### B40 — 4/9: o conserto pela metade, e por que ele é o mais difícil de notar (`docs/insights.md:3445-3472`)

**O que se viu.** *"`formatPercent` existe neste repositório com um docblock que descreve o defeito **no
passado**: 'existia em três lugares como `(x * 100).toFixed(1)`, que é o ponto decimal do JavaScript e não
o separador de quem lê'. A função está certa, tem chamadores, e o comentário narra a cura."*
(`docs/insights.md:3447-3451`)

*"**Três lugares continuavam com o padrão**: a tela do insumo (duas vezes), a tela da compra, e o
assistente — este último com `.replace('.', ',')`, que acerta em português e **erra no espanhol do
México**, onde o separador decimal é o ponto. A tela da compra é onde o dono decide se a nota subiu demais,
e ela dizia `9.4%`."* (`docs/insights.md:3453-3457`)

**A regra que fica.** *"O ajudante escrito não é o chamador trocado, e o docblock no passado esconde isso.
Um repositório com a função certa, chamadores legítimos e uma prosa dizendo 'isto foi consertado' parece
consertado — e é justamente por isso que ninguém volta a olhar. A varredura barata (`grep` pelo padrão
antigo, não pelo nome da função nova) leva trinta segundos, e é ela que separa 'consertei' de 'consertei em
todos os lugares'."* (`docs/insights.md:3459-3465`)

**Onde procurar mais deles.** *"Todo docblock que diz 'existia', 'era assim antes' ou 'isto substituiu' é
um convite para uma varredura pelo que ele diz ter substituído."* (`docs/insights.md:3467-3468`)

**O que mudou.** *"Os quatro chamadores; `movePhrase` do assistente passou a receber o idioma (a decisão
escrita é sobre as PALAVRAS dele serem portuguesas, não sobre o número ser formatado à mão); e uma guarda de
fonte que recusa a multiplicação por cem com `toFixed` na mesma linha de um `%` — precisa a ponto de deixar
passar os três inocentes: taxa de quatro casas, contagem de tachos, e a prosa que cita o padrão."*
(`docs/insights.md:3470-3472`)

Confirmado na árvore: `formatPercent` é chamada por `src/components/WhySheet.tsx:89,99`,
`src/assistant/skills.ts:78`, `src/assistant/text.ts:87` e `src/home/Mosaic.tsx:374` — **implementada e
chamada por tela**; o docblock em `src/assistant/text.ts:77` registra que *"o número sai do `formatPercent`,
e não de `toFixed().replace('.', ',')`"*; e a guarda de fonte está em `src/layers.test.ts:494-533`
(`porCentoNaMao(...)`).

---

### 31.7 Tipos que não protegem: dois ids da mesma forma

#### B41 — 3/9: dois ids do mesmo tipo, e o compilador de acordo (`docs/insights.md:2019-2046`)

**O que se viu.** *"Relendo o código que eu tinha acabado de empurrar, achei `placeId: d.itemId` nos fatos
do alarme. A demanda vem agrupada por **item** e o aviso conta **lojas** — com o id do item no lugar do id
da loja, quatro sabores pedidos pela mesma loja viravam 'quatro lojas esperando'."*
(`docs/insights.md:2021-2026`)

**Por que importa.** *"O TypeScript não reclamou porque os dois são `string`, e nenhuma tela mostrava esse
número: ele só existe dentro de uma notificação, que nenhuma suíte desta máquina consegue ler. **O defeito
estava no ponto exato onde as três redes deste projeto não alcançam — tipo, tela e teste.**"*
(`docs/insights.md:2028-2032`)

**O que mudou.** *"Os fatos passaram a ler os pedidos em aberto (que sabem de qual loja são) em vez de
derivar loja da demanda. E o teste que prova isso é contra **banco de verdade**, não contra um objeto montado
à mão: um dublê teria concordado com o defeito, porque eu mesmo o teria montado com o id errado."*
(`docs/insights.md:2034-2038`)

**E a separação que o teste forçou é o achado maior.** *"Os fatos moravam no mesmo arquivo do agendador, que
importa `react-native` para saber a plataforma — e um teste de Node não transforma esse pacote. Ou seja: **a
função não era testável, e era exatamente ali que o defeito estava.** Fato é trabalho da camada de dados;
plataforma é o que fica no adaptador. A regra prática: **quando um teste não consegue importar uma função,
isso não é limitação da ferramenta — é sinal de que a função está na camada errada.**"*
(`docs/insights.md:2040-2045`)

*"A mutação que guarda o caso está na lista (**68 agora**), e ela reprova se alguém trocar a loja pelo item de
novo."* (`docs/insights.md:2046`) Confirmado na árvore: os fatos vivem em `src/notify/facts.ts`, que chama
`stockAgainstOrders(LOCAL_COMPANY_ID, through)` (`src/notify/facts.ts:38`) — **implementado e chamado pelo
agendador**; o docblock em `src/notify/index.ts:14` registra que *"a separação é deliberada e tem precedente
nesta base: o `pickSuggestion` viveu"* na tela.

---

### 31.8 Ambiente, cache e pacote

#### B42 — 3/9: o teste passou aqui e reprovou no CI, e a diferença era a internet (`docs/insights.md:2107-2133`)

**O que se viu.** *"Uma checagem minha afirmava que, numa instalação virgem, **nenhuma peça da capa
convida** para abrir. Passou na máquina de desenvolvimento e reprovou no runner. A diferença não era o
código: era a **rede**. Aqui a previsão do tempo não é alcançada, então o cartão do tempo não existe; no
runner ela é alcançada, o cartão aparece — e ele **convida com razão**, porque tem a semana para
mostrar."* (`docs/insights.md:2109-2115`)

**Por que importa.** *"A afirmação estava larga: eu cobrei da CAPA INTEIRA uma propriedade que era da
PEÇA. Uma afirmação larga é a que primeiro mente quando o ambiente muda, e ela mente para o lado pior —
verde onde deveria reprovar, ou vermelho onde não há defeito. Neste caso as duas coisas ao mesmo tempo,
em máquinas diferentes."* (`docs/insights.md:2117-2121`)

**O que mudou.** *"A afirmação passou a olhar a sequência da própria peça:
`Últimas corridas | Nenhuma corrida registrada ainda`. Isso prova exatamente o que eu queria — não há
convite entre o título e a frase de vazio — e não depende de haver internet."*
(`docs/insights.md:2123-2126`)

**A regra que fica, e vale para toda a suíte.** *"Neste projeto o tempo é a única coisa que vem da rede, e
a suíte cobre de propósito os dois casos ('responde com ou sem internet'). Então **nenhuma afirmação pode
cobrar a AUSÊNCIA de algo que o tempo possa acrescentar**. Ausência é a forma de afirmação mais frágil que
existe num ambiente que varia, e a alternativa é sempre a mesma: afirmar a presença do que se espera, no
lugar exato onde se espera."* (`docs/insights.md:2128-2133`)

#### B43 — 4/9: o pacote fresco com o manifesto velho (`docs/insights.md:2396-2434`)

**O que se viu.** *"A tela de Ajustes escreve a versão no cabeçalho. Numa revisão de rotina ela dizia
**`0.2.0`** — cinco versões atrás do `app.json`, que diz `0.7.0`. `npx expo config` resolvia `0.7.0`
corretamente: quem estava velho era o **pacote**, exportado dois minutos antes."*
(`docs/insights.md:2398-2402`)

**O mecanismo.** *"O manifesto inteiro é embutido no `expo-constants` na hora de transformar o módulo, e a
chave do cache do Metro é o conteúdo *daquele módulo* — que não muda quando o `app.json` muda. Então a
exportação sai fresca, com o manifesto velho, e continua assim para sempre. `--clear` conserta na hora."*
(`docs/insights.md:2404-2408`)

**Por que é pior do que parece.** *"O campo visível é só a versão, mas o que está congelado é o manifesto
inteiro: ícone, esquema, plugins, permissões. E as duas ferramentas de olhar deste repositório —
`npm run shot` e o `e2e` — leem exatamente esse pacote. **Toda foto que mandei nesta sessão e toda
execução da suíte leram um manifesto de cinco versões atrás.**"* (`docs/insights.md:2410-2414`)

**A crença que escondeu.** *"O comentário no `e2e` dizia, com todas as letras: 'No `--clear`: that empties
the bundler cache, which buys nothing here'. Foi escrito quando a espera do portão estava sendo medida e
encolhida, e é verdade para o caso que ele tinha na mão — `expo export` reescreve `dist` de qualquer jeito.
É falso para o manifesto, e o comentário fez a pergunta parar de ser feita. É a mesma família do `dist`
reusado 'porque ele existia', um nível abaixo e mais difícil de ver: aqui a exportação **é** da execução."*
(`docs/insights.md:2416-2422`)

**O que mudou.** *"`scripts/manifesto.mjs` guarda o hash do `app.json` ao lado da marca da última
exportação, e `shot` e `e2e` passam `--clear` **só quando ele mudou** — os dois ou três minutos que o
comentário defendia continuam economizados nas outras execuções. E o `e2e` passou a afirmar, na tela de
Ajustes, que a versão exibida é a do `app.json`: a versão é o único campo visível do manifesto, então é
por ela que se percebe. Sem essa asserção, o próximo campo a envelhecer envelhece calado."*
(`docs/insights.md:2424-2431`) Confirmado na árvore: `scripts/manifesto.mjs`, 100 linhas.

**A regra que fica.** *"Cache invisível é cache que mente. Quando um dado nasce *fora* dos arquivos que o
cache tem como chave — um manifesto, uma variável de ambiente, um relógio —, alguma coisa no produto final
tem que dizer esse dado em voz alta, para uma asserção poder compará-lo com a fonte."*
(`docs/insights.md:2433-2434`)

---

### 31.9 Tema, marca e julgamento visual

#### B44 — 4/9: a forma de um tema não pode morar na tela (`docs/insights.md:2249-2281`)

**O que se viu.** *"O dono abriu o Papel e circulou o que sobrava do outro tema: 'como é que essas caixas
continuam aí?'. Eram **cinco** de uma vez — o retângulo de canto arredondado, o fundo lavado de cor, o
crachá preenchido atrás do ícone, a pílula do botão e a da etiqueta. Todas do Orgânico, que é um tema de
blocos e curvas; o Papel é serifa, traço fino e canto reto."* (`docs/insights.md:2251-2257`)

**Por que aconteceu, e é o achado.** *"A identidade do Papel estava escrita em `tokens.ts` — fonte, raio,
paleta — e **a forma não.** Forma é caixa ou régua, massa ou traço, selo ou desenho na página, e isso vivia
espalhado em cada componente com um valor só. `borderRadius: radius.xl` e
`backgroundColor: tint(cor, 0.13)` não são neutros: eles *são* o Orgânico, escritos onde o tema não
alcança. Trocar a fonte e a paleta produziu o Orgânico de fonte diferente, que foi exatamente o que ele
viu."* (`docs/insights.md:2259-2266`)

**O que mudou.** *"A forma desceu para o componente: `Card`, `Button` e `Chip` passam a perguntar `skin` e
a desenhar duas coisas diferentes — bloco de cor com canto redondo no Orgânico, régua sem fundo e sem
crachá com canto reto no Papel. A consequência prática é maior que as telas de hoje: **quem escrever uma
tela nova acerta nas duas caras sem pensar**, e a incoerência não volta quando ninguém estiver olhando."*
(`docs/insights.md:2268-2273`)

**E as cores também não eram dele.** *"Eram as do Orgânico com outra saturação — verde `#15803D` e violeta
`#5B4BA8` são cores de interface, frias, e brigam com creme quente do mesmo jeito que marcador
fluorescente briga com papel de carta. A família virou tinta: **verde-garrafa, azul-tinta, ameixa,
ocre**."* (`docs/insights.md:2275-2278`)

**A pergunta seguinte do dono fechou o raciocínio.** *"'Esse é o tema dark?'. Ao tirar as caixas eu tirei
junto a única coisa que separava a página do chão, e o Papel escuro virou um buraco preto com réguas
invisíveis. **Papel escuro é papel escuro** — carvão quente, tinta creme, régua que se enxerga —, não tela
apagada."* (`docs/insights.md:2280-2281`)

#### B45 — 4/9: eu tomei uma decisão do dono e escrevi ela como se fosse regra do sistema (`docs/insights.md:2825-2895`)

**O que se viu.** *"O dono abriu o aplicativo no celular e disse duas coisas: 'a logo do apk tb está
diferente' e 'nao consigo mudar o tema papel de dark para o light. o light tem q ser o padrão'. As duas
eram defeito, e as duas estavam na fundação, não no código."* (`docs/insights.md:2827-2831`)

**O ícone era o andaime.** *"`assets/icon.png` nunca foi trocado desde 31 de agosto, o dia em que o
projeto nasceu: **a seta azul da Expo, com as linhas-guia de construção ainda desenhadas por cima**. Todos
os seis arquivos de `assets/` têm a mesma data."* (`docs/insights.md:2833-2836`)

*"E o `src/config/brand.ts` promete, com todas as letras, que a marca é 'rendered from this path on a
100x100 viewBox so every surface — splash, icon, header, print — draws the exact same geometry'. Era
verdade em três superfícies e mentira na quarta — e a quarta é **o quadradinho pelo qual o aplicativo é
aberto**. A promessa não estava errada por descuido de escrita: **ela descrevia uma intenção que nunca
teve mecanismo.** Sem um script que desenhe, 'todas as superfícies saem do mesmo caminho' é uma frase, não
um fato."* (`docs/insights.md:2838-2845`)

**O tema é o achado grave.** *"O `ThemeProvider` lia `useColorScheme()` e ponto: a luz da tela era do
aparelho e de mais ninguém, sem controle em tela nenhuma."* O que torna outra coisa é o comentário que
estava ao lado, na tela de Ajustes, transcrito (`docs/insights.md:2847-2856`):

> *"Claro e escuro continuam seguindo o aparelho, **como o sistema manda** — o que se escolhe aqui é a
> IDENTIDADE, que é outra pergunta."*

*"Não era o sistema mandando. **Era eu escolhendo**, e vestindo a escolha de regra externa."* A fundação
contrariada é a de que *"'Depende' vira dado, nunca código — e nunca uma pergunta"*, e *"claro contra
escuro é o caso central disso — o dono no escritório e o operador na câmara fria podem querer coisas
diferentes no mesmo dia, e nenhum dos dois está errado"* (`docs/insights.md:2858-2864`).

**Por que isso é pior que um bug.** *"Um bug alguém encontra. Uma decisão minha escrita como regra do
sistema **desencoraja a próxima pessoa de procurar**: quem lesse aquele comentário concluiria que a
plataforma impõe, e não voltaria a olhar. O comentário não descrevia o código — ele defendia o código de
ser questionado."* E a consequência para a própria regra do projeto: *"'antes de chamar algo de defeito,
procure a decisão' … só funciona se as decisões registradas forem **do dono**. Uma decisão minha no meio
delas envenena a busca inteira, porque tem exatamente a mesma cara."*
(`docs/insights.md:2866-2874`)

**O que mudou.** *"Três caminhos — claro, escuro, seguir o aparelho — com o claro de padrão, que é a única
pergunta legítima e foi ele quem respondeu. A regra saiu do componente para `src/theme/scheme.ts`, e isso
não é arrumação: dentro do provider só o navegador a alcançava, e o `mutate` roda a unidade — as duas
mutações que a protegem **teriam sobrevivido**, com o e2e verde dizendo que estava tudo bem. E
`scripts/icons.mjs` desenha as seis superfícies a partir do `markPath`, recusando o que não entende."*
(`docs/insights.md:2876-2881`)

Confirmado na árvore, com os valores exatos: `export type SchemeChoice = 'claro' | 'escuro' | 'sistema'`
(`src/theme/scheme.ts:25`), `export const SCHEMES: SchemeChoice[] = ['claro', 'escuro', 'sistema']`
(`src/theme/scheme.ts:28`), `export const SCHEME_PADRAO: SchemeChoice = 'claro'`
(`src/theme/scheme.ts:38`) e `resolveScheme` (`src/theme/scheme.ts:50`), lido por
`src/theme/ThemeProvider.tsx:4` e `src/theme/Appearance.tsx:3` — **implementado e chamado por tela**. O
gerador está em `scripts/icons.mjs` (169 linhas), lê `markPath` de `src/config/brand.ts:25` — o valor é
`'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'` — e recusa com a mensagem *"markPath mudou de forma e este
gerador só sabe 'disco com uma cunha'"* (`scripts/icons.mjs:37,45`).

**Duas coisas que quase entraram caladas no conserto** (`docs/insights.md:2883-2890`):

- *"A medida de luminância do e2e **passava pelo motivo errado**. O React Native Web põe uma chapa cinza
  fixa do tamanho exato da janela, e o `>` da busca pelo maior elemento ficava com a primeira em ordem de
  documento — a fixa. A medida dava **0,95 nos dois temas**: a asserção de 'abre claro' media uma coisa que
  nunca muda. Empate de área se resolve por quem pinta **por cima**."*
- *"E a checagem antiga da identidade, que existe desde a reescrita visual, só afirma que o fundo 'existe'
  — verdade de graça pelo mesmo motivo."*

**A regra que fica.** *"Decisão de dono escrita por mim é a pior linha de comentário que existe neste
repositório. Quando eu escolher um lado de um 'depende', o comentário tem que dizer **quem escolheu e que a
outra opção não foi construída** — nunca 'como o sistema manda'. Se a frase que eu ia escrever atribui a
escolha a uma força externa, ela é o sinal de que eu decidi sozinho."*
(`docs/insights.md:2892-2895`)

#### B46 — 4/9: o número da auditoria era o do extremo, e a régua não existia (`docs/insights.md:3334-3368`)

**O que se viu.** *"O achado 10 dizia: 'o tom `inkFaint` dá **2,55:1** nas quatro combinações de tema'. Fui
medir antes de mexer, e as duas metades da frase estavam erradas de um jeito que importa: são **seis**
paletas (duas do tema base, duas do Papel, duas do Orgânico), e 2,55 é o **pior caso** — a faixa real era
**2,35 a 4,43**. O achado está certo (nenhuma das seis passa a régua da WCAG); o número era o do extremo
apresentado como o de todas."* (`docs/insights.md:3336-3342`)

**O que fez a diferença.** *"Não foi olhar melhor: foi escrever a régua primeiro. Eu escrevi
`src/theme/contrast.test.ts` antes de trocar uma cor, deixei falhar, e a falha imprimiu as **dezoito
combinações** com o valor de cada uma. Aí a correção deixou de ser gosto — para cada paleta, escureça (ou
clareie) mantendo o matiz até o pior fundo passar de **4,6**."* (`docs/insights.md:3344-3348`)

**A regra que fica.** *"Número em achado é medida ou é lembrança, e as duas se parecem no texto. Um
relatório escrito por dez auditores em paralelo tem números que ninguém recontou, e o meu papel ao
consertar é medir de novo — não porque o achado seja suspeito, mas porque **a régua que mede é a mesma
coisa que a guarda que protege**. Escrever a medição como teste dá as duas de uma vez, e é mais barato que
conferir à mão uma vez."* (`docs/insights.md:3350-3355`)

**Duas coisas que a régua pegou de graça** (`docs/insights.md:3357-3364`):

- *"`const palettes = { light, dark }` entrou na varredura como se fosse uma paleta, e o corpo dela engoliu
  a paleta escrita abaixo — o teste media a mesma coisa duas vezes com o nome errado. Bloco que contém outra
  declaração não fechou onde eu pensei: passou a ser recusado."*
- *"Legível pode virar 'tudo igual'. Subir `inkFaint` até encostar em `inkMuted` apagaria a hierarquia de
  três camadas de tinta, e a tela ficaria plana. A guarda afirma as duas coisas: a régua e a ordem."*

**O que mudou.** *"As seis paletas em `src/theme/tokens.ts`, o docblock que diz por quê, a guarda que lê as
cores do próprio arquivo, e uma mutação que devolve a tinta velha."* (`docs/insights.md:3366-3368`)
Confirmado na árvore: `src/theme/contrast.test.ts`, 132 linhas.

#### B47 — 4/9: a ferramenta de olhar ficou cega de três jeitos no mesmo dia (`docs/insights.md:3473-3500`)

**O que se viu.** *"O dono mandou uma foto da capa dele e disse: *refaça até acertar*. Fui olhar, e antes de
achar qualquer defeito de tela, achei que **eu não conseguia olhar**"* (`docs/insights.md:3475-3477`):

| cegueira | mecanismo |
|---|---|
| **Idioma** | *"`npm run shot` morreu procurando o campo 'Procurar cidade'. O navegador headless é `en-US`, e desde que o idioma virou escolha da empresa — com o aparelho como palpite do primeiro dia — o aplicativo abre em inglês ali. A ferramenta parou de funcionar por causa de um conserto meu, três horas antes."* (`docs/insights.md:3479-3483`) |
| **Luz** | *"`--escuro` ajustava o `colorScheme` do navegador. O aplicativo passou a ter escolha própria, com padrão claro (decisão do dono) — então a foto do escuro saía **idêntica à do claro**, e eu teria olhado duas vezes a mesma tela dizendo que vi as duas. Esta é a pior das três: a ferramenta não falhou, ela **mentiu**."* (`docs/insights.md:3484-3488`) |
| **Largura** | *"Ela fotografava **412 px** e só. O corte que o dono viu — 'Transpo…', 'Relatóri…' — **não existe a 412**. A **360**, que é o Android que uma fábrica de seis pessoas compra, ele aparece na primeira foto."* (`docs/insights.md:3489-3492`) |

**A regra que fica.** *"Quando uma preferência deixa de ser do aparelho e passa a ser do aplicativo, toda
ferramenta que dirige o aplicativo de fora fica cega no mesmo instante — e a cegueira é silenciosa, porque a
ferramenta continua produzindo uma imagem. **Idioma, tema e fuso saíram do aparelho hoje; três ferramentas
dependiam do aparelho para configurá-los; nenhuma reclamou.**"* (`docs/insights.md:3494-3497`)

**E a terceira tem regra própria.** *"Instrumento que só olha um tamanho é cego para todo defeito que
depende de tamanho, que é metade dos defeitos de tela. O `--largura` agora existe, e a foto estreita ganha
nome próprio para não sobrescrever a larga — comparação entre duas larguras é o motivo de a largura
existir."* (`docs/insights.md:3498-3500`)

#### B48 — 4/9: cor de acento não é cor de fundo, e ícone só se julga ao lado dos irmãos (`docs/insights.md:3516-3534`)

**O que se viu.** *"A capa tinha uma faixa de céu de **140 px** com degradê entre duas cores da paleta. As
fotos das quatro combinações mostraram três formas do mesmo defeito: **lama no claro** (verde da marca
interpolado com rosa passa por cinza-barro no meio), **adesivo pastel aceso no escuro**, e um **vazio de
92 px no Papel**, cuja identidade é traço."* (`docs/insights.md:3518-3522`)

**O erro não era a cor escolhida: era a ÁREA.** *"As cores desta paleta são tinta e traço — medidas para
desenhar sobre um fundo, não para preencher um terço da tela. Ampliar uma cor de acento até virar fundo é
exatamente o mesmo erro que ampliar `inkFaint` até virar texto de corpo, e as duas coisas foram consertadas
hoje, com seis horas de diferença, **sem eu perceber que eram a mesma**."*
(`docs/insights.md:3524-3528`)

**E o ícone.** *"O ícone de 'Produção' — o picolé num aplicativo que promete servir qualquer fábrica — levou
**três desenhos** para ficar de pé, cada um reprovado por uma foto da barra de abas: três unidades
empilhadas viraram irmãs do ícone de 'Mais'; unidade sobre esteira com roletes virou irmã do caminhão.
**Ícone não se julga sozinho: ele se julga na fileira em que vai viver.** O primeiro parecia ótimo
isolado."* (`docs/insights.md:3530-3534`)

#### B49 — 4/9: "maior que" não é hierarquia, e o dono viu antes de mim (`docs/insights.md:3535-3569`)

**O que se viu.** *"Subi `inkFaint` até a régua de 4,5:1 da WCAG de manhã, com guarda escrita, teste passando
e mutação plantada. À tarde o dono abriu o aplicativo e disse: 'cadê o tema papel light? você fez o dark,
ficou ok. falta o light.'"* (`docs/insights.md:3537-3541`)

A conta, transcrita — Papel claro depois do conserto (`docs/insights.md:3543-3549`):

| camada | contraste sobre o papel |
|---|---|
| `ink` | 15,35 |
| `inkMuted` | **5,34** |
| `inkFaint` | **5,07** |

*"**Cinco por cento** de diferença entre a tinta do corpo e a da legenda. **Três camadas viraram duas**, e a
tela que separa rótulo de dado por tom ficou plana. O Orgânico claro tinha o mesmo defeito (**1,24×** de
passo); os dois ESCUROS estavam em **1,5×** e por isso pareciam prontos — é a diferença que ele viu sem medir
nada."* (`docs/insights.md:3551-3555`)

**A guarda escrita pelo próprio autor passou.** *"Porque ela pedia `média > fraca` e 5,34 é maior que 5,07.
**Ordem não é hierarquia.** Uma régua que só ordena aceita três tons colados como se fossem três camadas, e o
defeito que ela deixa passar é exatamente o que a régua existia para impedir: uma tela onde tudo tem o mesmo
peso."* (`docs/insights.md:3557-3561`)

**A regra que fica.** *"Guarda de grandeza contínua precisa de PASSO MÍNIMO, não de ordem. Onde houver escala
— tinta, tamanho de fonte, espaçamento, opacidade —, a pergunta certa nunca é 'está na ordem?', é **'a
distância entre dois vizinhos é grande o bastante para alguém perceber?'**. O piso agora é **1,35×**, e ele
não é gosto: é o que os dois temas escuros, que estavam certos, já mediam."*
(`docs/insights.md:3563-3566`) Confirmado na árvore: `const PASSO = 1.35;`
(`src/theme/contrast.test.ts:113`), com o docblock em `src/theme/contrast.test.ts:101-110` — *"o passo mínimo
entre as três tintas — e por que 'maior que' não bastava… 1,35× é o piso, e ele não é gosto: os dois temas
ESCUROS, que estavam prontos"*.

**E a segunda metade, que é mais desconfortável.** *"Eu consertei um número e quebrei um sistema. A régua da
WCAG olha uma cor contra um fundo, uma de cada vez; a hierarquia é uma propriedade do CONJUNTO. Otimizar cada
peça isolada contra um limite externo é como escrever trinta e três telas que passam no teste e não parecem o
mesmo aplicativo — o defeito não está em nenhuma delas."* (`docs/insights.md:3567-3569`)

---

### 31.10 Erros que se repetiram mais de uma vez — o arquivo inteiro

Esta seção varre `docs/insights.md` do começo ao fim (as duas metades) e junta as
famílias de defeito que aparecem **duas ou mais vezes**. A ordem é por número de
aparições. Cada linha traz onde cada aparição está registrada.

| # | família | aparições | onde |
|---|---|---|---|
| R1 | tabela da fila que o servidor não deixa reenviar | **5** | `docs/insights.md:652-691` (0015) · `1723-1764` (0020) · `2732-2779` (0027) · `3412-3417` (0030) · `3410-3444` (0031) |
| R2 | peça construída sem chamador (P1) | **≥ 12** | `208-238` · `933-958` · `960-971` · `1131-1156` · `1723-1764` · `2169-2174` · `2470-2496` · `2547-2586` · `2589-2597` · `2668-2731` · `3203-3208` · `3222-3228` |
| R3 | instrumento que só sabe dizer "sim" (verde por construção) | **≥ 8** | `323-363` · `1484-1494` · `2077-2106` · `2134-2166` · `2780-2824` · `2883-2890` · `2945-3020` · `3234-3272` |
| R4 | número contado numa variável e nomeado noutra (o rótulo que discorda) | **35 instâncias, 3 registros** | `2304-2338` (3) · `2339-2395` (31) · `2435-2469` (1, dentro de outro conserto) |
| R5 | docblock/comentário que promete o que o código não faz | **≥ 7** | `718-757` · `1131-1156` · `2222-2229` · `2470-2496` · `2693-2699` · `2838-2845` · `3068-3101` · `3445-3472` |
| R6 | `company_id` usado como se fosse o lugar (singular que virou plural) | **5** | `1158-1179` · `3068-3101` · `3128-3160` · `3150-3153` (aviso de validade) · `3161-3200` |
| R7 | arredondar cedo / formatador com suposição de precisão | **≥ 6** | `267-274` · `323-363` · `2003-2018` · `2246-2248` · `2357-2360` · `3445-3472` |
| R8 | lista escrita à mão que envelhece longe de quem a usa | **5** | `2075-2076` (colunas do build / `src/weather`) · `2782-2804` (`erase.ts`, 12 de 21) · `2896-2944` (a tabela do plano) · `2952-2963` (`COPIAR` do `mutate`) · `3430-3433` (checagem 9 cobrindo uma tabela) |
| R9 | regra de negócio morando na tela em vez do domínio | **5** | `208-238` · `1806-1844` (`pickSuggestion`, `qrPath`) · `2040-2045` (fatos do alarme) · `2876-2881` (`scheme`) · `3068-3101` |
| R10 | asserção de ausência sem asserção de presença ao lado | **4** | `2107-2133` · `2384-2389` (duas: assistente e e2e) · `2528-2535` → virou guard `56-vacuous-negative` (`2539-2546`) |
| R11 | ferramenta de olhar que mente | **4** | `2396-2434` (manifesto velho) · `2883-2890` (luminância) · `3473-3500` (idioma, luz, largura) · `3501-3515` (asserção copiada da saída) |
| R12 | teste que segura a frase e deixa o número passar | **3** | `1516-1539` · `2384-2389` · `2989-2993` |
| R13 | guarda que compara duas coisas escritas pela mesma mão | **3** | `2780-2824` (`erase.test.ts`) · `3102-3127` (o dublê do assistente) · `2751-2759` (verificação com mais poder que a realidade) |
| R14 | conserto pela metade (o gatilho sem o alvo) | **3** | `2167-2202` (escrita sem as leituras) · `2728-2731` · `3445-3472` |
| R15 | número grande sem comparação (Lei 3) | **2 registros, 13 números** | `1883-1919` (3 telas) · `2134-2166` (10 números da capa) |
| R16 | escolher pelo cliente com aparência de escolha | **2** | `1981-2002` (seis chips de hora) · `2825-2895` (tema "como o sistema manda") |
| R17 | matar processo por padrão / verificar fazendo | **2 + 1** | `3392-3409` (`pkill`, segunda vez) · `3021-3067` (`import()` como checagem de sintaxe) |
| R18 | otimizar a peça isolada e quebrar o conjunto | **2** | `3516-3534` (área da cor de acento) · `3535-3569` (`inkFaint` contra a WCAG) |

#### R1 — a tabela da fila que o servidor não deixa reenviar (cinco vezes)

A forma: *"a fila do aparelho sobe com `on conflict (id) do update`, e a tabela não
tem política de update no servidor"* (`docs/insights.md:2734-2737`). O motor para a
fila no primeiro buraco de propósito, então **uma tabela sem reenvio trava tudo o que
vier depois**.

| migração | tabela | como foi achada |
|---|---|---|
| 0015 | `purchases`, `purchase_lines` | a checagem 6 parou de rodar como superusuário e a **segunda** passagem da fila foi recusada (`docs/insights.md:652-656`) |
| 0020 | `lots` | ao escrever o escritor do lote, *"é exatamente o que a migração `0015` consertou"* (`docs/insights.md:1734-1740`) |
| 0027 | `orders` | **forma nova**: a política existia, com a capacidade errada (`docs/insights.md:2745-2749`) |
| 0030 | o lugar padrão | (`docs/insights.md:3412-3417`) |
| 0031 | `readings` | **a primeira achada procurando a família**, com dois `grep` (`docs/insights.md:3419-3421`) |

A lição escrita na quinta: *"erro que apareceu quatro vezes não se conserta na quinta —
se varre… o custo de listar a família inteira foi de dois `grep`; o de esperar a quinta
aparição foi quatro migrações e uma auditoria"* (`docs/insights.md:3435-3439`). E a
lição escrita na terceira, que explica por que a busca falhava: *"quando uma família
reaparece, procure a forma nova, não a forma velha"* (`docs/insights.md:2778-2779`).

#### R2 — peça construída sem chamador (doze vezes, e o portão P1 nasceu disso)

Registrado desde 1 de setembro: *"coisa construída sem chamador, quatro vezes, nenhuma
pega pelo número da fase"* (`docs/insights.md:970-971`). A lista completa das
aparições, com o estado de cada uma no registro:

| peça | registro | desfecho |
|---|---|---|
| `src/domain/ledger.ts` inteiro (importado só por `app/foundation.tsx`) | `docs/insights.md:20-24` | ganhou chamador (a migração V3) |
| a regra de aviso antes de gastar dinheiro, no JSX | `docs/insights.md:208-238` | desceu para o domínio |
| `movements.assistant_phrase`, com índice próprio e nenhuma escrita | `docs/insights.md:933-958` | ganhou escritor |
| `Recipe`: a versão prometida no comentário, campo inexistente | `docs/insights.md:1131-1156` | campo criado |
| `lots` no servidor, sem escritor no aparelho | `docs/insights.md:1723-1764` | ganhou escritor |
| o estorno (esquema, restrição, política, construtor) | `docs/insights.md:2169-2174` | ganhou escritor |
| `explodeRequirements`, com docblock prometendo a lista de compras | `docs/insights.md:2470-2496` | virou `shoppingList`, chamada pelo assistente |
| quatro seções de dicionário (medidas: **sete**, 870 chaves) | `docs/insights.md:2547-2586` | quatro apagadas, três declaradas como fronteira |
| `balanceOf`, `balanceAt`, `lotsPresentDuring`, `buildReversal` | `docs/insights.md:2589-2597` | **apagadas** |
| `release-apk.yml` + `apk-release.txt` (código **armado**, não morto) | `docs/insights.md:2668-2731` | apagados |
| `serialize` / o motor de sincronização | `docs/insights.md:3203-3208` | **segue sem chamador** |
| `item_costs`/`item_cost_history` no serializador, `forgetSentBefore` | `docs/insights.md:3222-3228` | seguem sem chamador |

Três aprendizados que só apareceram por repetição:

1. *"Quando nada chama uma peça, há três respostas honestas — trazer o chamador, apagar
   a peça, ou registrar a fronteira com quem vai chamá-la. **Escrever teste não é uma
   delas.**"* (`docs/insights.md:2630-2632`)
2. *"O portão P1 diz o que *entra* sem chamador. Faltava a outra metade — o que **fica**
   sem chamador depois que o chamador some."* (`docs/insights.md:2584-2586`)
3. O avesso: **o chamador sem uso** — vinte lançamentos lidos para usar a data de um
   (`docs/insights.md:3284-3289`).

E a fronteira, para a família não virar caça às bruxas: *"antes de chamar de defeito, a
decisão"* — `posts`, `stepper` e `scan` ficam porque têm escopo escrito
(`docs/insights.md:2555-2560`), e apontar o `UnitStepper` como defeito *"já custou uma
rodada antes"* (`docs/insights.md:2557`).

#### R3 — o instrumento que só sabe dizer "sim"

Oito aparições, todas com a mesma assinatura: **a verificação passa, e o que ela mede não
é o que ela promete.**

| aparição | o que media de verdade |
|---|---|
| `mutate`, primeira execução: `Math.round` → `Math.floor` no `amountOf` | *"noventa e dois testes continuaram verdes"* — todo fixture caía em centavo exato (`docs/insights.md:330-336`) |
| ida e volta do campo de perda | *"o `seed.ts` semeia perdas de 0.02, 0.04, 0.05 e 0.08: todos percentuais inteiros… as catorze verificações e2e nunca digitaram um separador"* (`docs/insights.md:1488-1494`) |
| o guard de frase cravada | a régua era **acento**, e *"'Custo do lote' não tem acento nenhum"* (`docs/insights.md:2079-2083`) |
| `law.test.ts` com chave por arquivo | aprovava a capa inteira pela comparação de um dos dez números (`docs/insights.md:2136-2143`) |
| `erase.test.ts` | *"todo membro do conjunto fechado está na lista do conjunto fechado"* (`docs/insights.md:2790-2792`) |
| a medida de luminância do e2e | a chapa cinza fixa do React Native Web: **0,95 nos dois temas** (`docs/insights.md:2883-2888`) |
| a oficina do `mutate` | *"a suíte da oficina saía com `# fail 19` sem mutação nenhuma"* → **66 commits** de portão cego (`docs/insights.md:2965-2968`) |
| `suitePasses` com dois estados | *"toda execução que não imprime resumo cai no lado do 'falhou', e 'falhou' quer dizer 'pegou'"* (`docs/insights.md:3242-3245`) |

As três regras que a família produziu, em ordem cronológica:

- *"Uma guarda com granularidade errada é pior que guarda nenhuma, porque **compra
  silêncio**."* (`docs/insights.md:2151-2153`)
- *"Toda ferramenta de verificação precisa de uma verificação de si mesma, e ela tem que
  rodar antes do veredito, não depois… **como este instrumento se pareceria se estivesse
  quebrado?**"* (`docs/insights.md:3016-3020`)
- *"Instrumento que só distingue dois estados chama ausência de medida de resultado
  favorável… onde há três estados e o código lê dois, o terceiro vira o que quem escreveu
  esperava ver."* (`docs/insights.md:3257-3263`)

#### R4 — o número contado numa variável e nomeado noutra

Trinta e cinco instâncias em três registros consecutivos, e o terceiro apareceu **dentro
do conserto de outra coisa**, escrito por quem tinha acabado de caçar as trinta e uma
(`docs/insights.md:2454-2460`). O registro do dia 4 corrige o do dia 4 anterior:
*"'não há script' era verdade sobre *scripts*, e falso sobre *método*"*
(`docs/insights.md:2378-2380`). Os seis lugares previsíveis onde ela mora estão
transcritos no item B32 (`docs/insights.md:2391-2395`).

#### R5 — o docblock que promete o que o código não faz

Sete aparições e três formas distintas, que vale separar porque a busca por cada uma é
diferente:

| forma | exemplo | como se procura |
|---|---|---|
| promessa de chamador | *"This is the query behind the shopping list that writes itself"* sem lista de compras (`docs/insights.md:2472-2477`) | `grep` no docblock + "quem chama isto?" |
| justificativa verdadeira **sobre outra coisa** | *"Nada é escrito em `item_costs`. Valor derivado tem um autor só"* — verdade sobre o insumo, e o produto não tinha autor nenhum (`docs/insights.md:2222-2229`) | perguntar sobre **qual `item_id`** a frase fala |
| cura narrada no passado | *"existia em três lugares como `(x * 100).toFixed(1)`"* com três lugares ainda vivos (`docs/insights.md:3447-3457`) | `grep` pelo **padrão antigo**, não pelo nome da função nova |

Mais duas do mesmo tronco: o docblock de `recordCount` descrevia o defeito exato que a
tela cometeu (`docs/insights.md:3072-3085`) — *"docblock não é guarda"* — e o
`src/config/brand.ts` prometia que **todas** as superfícies saem do `markPath` quando o
ícone do aplicativo era a seta azul da Expo (`docs/insights.md:2838-2845`) — *"ela
descrevia uma intenção que nunca teve mecanismo"*.

#### R6 — `company_id` usado como se fosse o lugar

`ensureLocation` cria uma `location` cujo id **é** o `company_id`
(`docs/insights.md:3177-3180`). Enquanto houve um lugar só, *"'o total da empresa' e 'a
sala padrão' foram o mesmo número, e nenhum teste podia distinguir uma leitura da outra"*.

| aparição | efeito |
|---|---|
| 1/9 — `recordCount` calculava o esperado com `WHERE company_id = ? AND item_id = ?` e gravava num lugar só (`docs/insights.md:1158-1161`) | primeira aparição, corrigida na origem |
| 4/9 — a tela do insumo mostrava o total da empresa e gravava no almoxarifado (`docs/insights.md:3077-3085`) | **−38.000 g** contra a fábrica |
| 4/9 — `stockAgainstOrders` lia `defaultLocationId` (`docs/insights.md:3130-3141`) | *"nada para prometer"* com o freezer cheio |
| 4/9 — o aviso de validade (`docs/insights.md:3150-3153`) | citado na lista das três |
| 4/9 — a produção lia a empresa e descontava do almoxarifado (`docs/insights.md:3170-3175`) | toda corrida recusada, **em inglês** |

A regra final: *"id que significa duas coisas é dívida com data de vencimento. O
vencimento chega no dia em que o segundo lugar é cadastrado — e ele chega em silêncio,
porque o dia em que o dono cria a câmara fria não é um dia de commit."*
(`docs/insights.md:3185-3189`)

#### R7 — arredondar cedo

A fundação diz *"só o valor final arredonda, uma vez"* (`docs/insights.md:270-272`), e a
regra foi quebrada em seis lugares diferentes:

1. o custo do tacho arredondando **cada linha** antes de somar — *"dez ingredientes de
   quatro décimos de centavo somavam zero num tacho que custa quatro"*
   (`docs/insights.md:268-270`);
2. a **direção** do arredondamento do `amountOf`, sem nada segurando
   (`docs/insights.md:330-336`);
3. `formatQuantity` engolindo a fração da temperatura: gravou **−18,4**, mostrou **−18**
   (`docs/insights.md:2005-2008`);
4. o evento de compra reusado na corrida: média **64,996** contra custo congelado
   **64,99686** — *"dois números para o mesmo picolé no dia em que ele nasceu"* — que fez
   nascer o `blendRate` (`docs/insights.md:2246-2248`);
5. o selo de variação: *"4.802 contra 4.800 também imprimia 0%"*
   (`docs/insights.md:2357-2360`);
6. `(x * 100).toFixed(1)` em quatro chamadores, com `9.4%` na tela onde o dono decide se a
   nota subiu demais (`docs/insights.md:3453-3457`).

A categoria que o registro nomeia na terceira: *"todo formatador carrega uma suposição
sobre o que é precisão suficiente, e ela é invisível até um dado novo passar por ele"*
(`docs/insights.md:2015-2018`).

#### R8 — a lista escrita à mão que envelhece longe de quem a usa

*"Terceira forma da mesma doença num dia"*, nas palavras do próprio registro
(`docs/insights.md:3017-3020`): *"`erase.ts` conhecia 12 de 21 tabelas; a tabela do plano
envelheceu no dia em que nasceu; e aqui uma lista de quatro pastas decidia, sem saber, se o
portão inteiro perguntava alguma coisa."* Some-se a lista de colunas que o `build`
acrescenta — *"uma lista à mão ao lado do código é a mesma lista à mão que já deixou
`src/weather` fora da checagem de camadas por meses"* (`docs/insights.md:2075-2076`) — e a
checagem 9, que conhecia a forma do defeito e replicava **uma tabela**
(`docs/insights.md:3430-3433`).

O conserto é sempre o mesmo, e está escrito três vezes com palavras diferentes: **perguntar
ao sistema em vez de perguntar à lembrança de quem escreveu** — a guarda de apagar passou a
ler `src/data/db.ts` (`docs/insights.md:2812-2816`), a lista do `mutate` virou de exclusão
(`docs/insights.md:3002-3005`), e a lista de colunas é obtida **chamando** o build
(`docs/insights.md:2075-2076`).

#### R9 — regra de negócio morando na tela

Cinco vezes, e a consequência é sempre a mesma: **o `mutate` roda a suíte de unidade, então
regra dentro de componente não é alcançada por mutante nenhum** (`docs/insights.md:1823-1827`).

- a regra que avisa antes de gastar dinheiro, no JSX (`docs/insights.md:208-238`);
- a zona de silêncio do QR, *"que sobreviveu a dois mutantes até descer para
  `src/domain/qr.ts`"* (`docs/insights.md:1826-1827`);
- a ordem de preferência da separação, que sobreviveu três vezes até virar `pickSuggestion`
  (`docs/insights.md:1808-1832`);
- os fatos do alarme, presos no arquivo do agendador que importa `react-native` — *"quando um
  teste não consegue importar uma função, isso não é limitação da ferramenta — é sinal de que a
  função está na camada errada"* (`docs/insights.md:2040-2045`);
- a escolha de tema dentro do `ThemeProvider`: *"as duas mutações que a protegem teriam
  sobrevivido, com o e2e verde dizendo que estava tudo bem"* (`docs/insights.md:2876-2881`).

E o contraponto registrado, para não virar dogma: existe defeito que **só** mora na tela — a
combinação de duas linhas distantes dentro de um arquivo de tela, que teste de unidade é cego
para ver por construção, e que virou guarda de fonte em `src/layers.test.ts`
(`docs/insights.md:3094-3101`, `3191-3196`).

#### R10 — afirmar ausência sobre um sujeito que pode estar vazio

Quatro aparições, três delas **no mesmo dia**, o que disparou a regra do projeto de virar
guard: *"conselho eu esqueço na próxima sessão; guard roda sozinho"*. Virou
`56-vacuous-negative` na proofgate, [PR #16](https://github.com/ChrnX0/proofgate/pull/16) —
*"dispara quando uma linha afirma ausência sobre um sujeito que o mesmo diff defaultou para
vazio e nada naquele arquivo afirma um comprimento. Estreito de propósito — só arquivo de teste,
WARN, e medido contra um diff real de 31 mil linhas com zero disparos"*
(`docs/insights.md:2539-2546`).

A prima dessa família é a afirmação de ausência **larga**: cobrar da capa inteira que nenhuma
peça convide, num ambiente onde a previsão do tempo às vezes chega
(`docs/insights.md:2109-2133`).

#### R11 — a ferramenta de olhar que mente

Quatro vezes, e a distinção que o registro faz é a que importa: *"a ferramenta não falhou, ela
**mentiu**"* (`docs/insights.md:3487-3488`). Ferramenta que quebra é barata; ferramenta que
produz uma imagem errada custa o dia inteiro:

- o pacote exportado com o manifesto de cinco versões atrás — *"toda foto que mandei nesta
  sessão e toda execução da suíte leram um manifesto de cinco versões atrás"*
  (`docs/insights.md:2410-2414`);
- a luminância medindo a chapa cinza fixa (`docs/insights.md:2883-2888`);
- `npm run shot` cego de idioma, de luz e de largura (`docs/insights.md:3479-3492`);
- e a asserção do e2e escrita **copiando a saída** em vez da regra, que travou `41.1%` no lugar
  por semanas (`docs/insights.md:3503-3515`).

A regra transversal: *"quando uma preferência deixa de ser do aparelho e passa a ser do
aplicativo, toda ferramenta que dirige o aplicativo de fora fica cega no mesmo instante"*
(`docs/insights.md:3494-3497`).

#### R12 — o teste que segura a frase e deixa o número passar

Três vezes: o consumo do assistente, cujo teste exigia a frase *"pelo que saiu"* e não a conta
(`docs/insights.md:1520-1525`); a asserção do e2e que casava `/6\.000/` com a mensagem *"na
unidade do item"* **sem a unidade existir** (`docs/insights.md:2384-2389`); e a corrida aberta,
cujo teste conferia *"o **objeto devolvido**, não a linha gravada"*
(`docs/insights.md:2989-2993`).

A pergunta de revisão que saiu daí, transcrita: *"este teste falharia se a conta estivesse errada
e a frase certa?"* (`docs/insights.md:1533-1539`)

#### R13 — a guarda que compara duas coisas escritas pela mesma mão

*"De onde vem o outro lado da comparação? Se a resposta é 'do mesmo arquivo', o teste mede
memória, não sistema."* (`docs/insights.md:2824`) Três formas:

- o `Record` escrito à mão comparado com o union do mesmo arquivo
  (`docs/insights.md:2782-2795`);
- o dublê que descrevia um mundo impossível — 50.000 no total e 50.000 + 6.000 nos lugares — e
  por isso **não podia observar** a diferença entre o total e a prateleira, com trinta e quatro
  testes verdes (`docs/insights.md:3104-3117`);
- a verificação rodando com **mais poder que a realidade**: `enum_range(null::capability)` na
  checagem 6 e `place_order` + `dispatch` na 8 — *"é a mesma doença que o `db:verify` já teve e já
  consertou uma vez, quando rodava como superusuário"* (`docs/insights.md:2751-2759`).

#### R14 — o conserto pela metade

Três vezes, e é a família que o registro chama de mais difícil de notar, *"porque o texto ao lado
descreve um estado que o código não tem mais"* (`docs/insights.md:2728-2731`):

- escrever o estorno e não consertar as oito leituras que filtram por `kind`
  (`docs/insights.md:2176-2185`);
- trocar o gatilho do workflow e deixar o ponteiro de 177 commits atrás
  (`docs/insights.md:2693-2699`);
- escrever `formatPercent` e deixar quatro chamadores com o padrão antigo
  (`docs/insights.md:3453-3465`).

#### R15 a R18 — as famílias de duas aparições

- **R15, número sem comparação (Lei 3).** Três telas num dia (`docs/insights.md:1885-1891`) e,
  depois da guarda escrita, **nove dos dez números da capa** que a guarda não via
  (`docs/insights.md:2136-2143`). A lei estava no `CLAUDE.md` desde o começo do projeto; *"a lei
  mora num arquivo de texto e texto não roda"* (`docs/insights.md:1893-1897`).
- **R16, escolher pelo cliente com aparência de escolha.** Os seis chips de hora — *"eu chamei de
  configuração um menu"* (`docs/insights.md:1983-1988`) — e o tema apresentado como imposição da
  plataforma — *"não era o sistema mandando. Era eu escolhendo, e vestindo a escolha de regra
  externa"* (`docs/insights.md:2858-2860`). A dívida ainda aberta desta família são os chips de
  antecedência (**1, 2, 3, 5, 7, 14**), nomeados como próximo suspeito
  (`docs/insights.md:2000-2002`).
- **R17, operação: parar processo e "verificar fazendo".** O `pkill -f` que casou com o próprio
  comando do shell, *"segunda aparição na história deste projeto, com a regra já escrita"*
  (`docs/insights.md:3402-3403`); e o `import()` usado como checagem de sintaxe, que rodou a suíte
  de mutação por oito horas em processo órfão (`docs/insights.md:3023-3041`). A regra irmã:
  *"a maneira de verificar uma coisa não pode ser fazer a coisa"* (`docs/insights.md:3059-3061`).
- **R18, otimizar a peça e quebrar o conjunto.** Ampliar uma cor de acento até virar fundo e
  ampliar `inkFaint` até virar texto de corpo — *"as duas coisas foram consertadas hoje, com seis
  horas de diferença, sem eu perceber que eram a mesma"* (`docs/insights.md:3524-3528`); e a régua
  da WCAG aplicada cor a cor, que achatou três camadas de tinta em duas
  (`docs/insights.md:3551-3561`).

#### O que a repetição ensinou sobre a própria busca

Três frases do arquivo, que juntas formam o método que a segunda metade descobriu:

1. **Varrer, não consertar a aparição.** *"Erro que apareceu quatro vezes não se conserta na
   quinta — se varre… a pergunta deixa de ser 'onde está este?' e passa a ser 'qual é a lista
   completa de lugares onde ele caberia, e o que prova que cada um está coberto?'"*
   (`docs/insights.md:3435-3439`)
2. **Procurar a forma nova, não a forma velha.** *"A frase que registra um conserto vira o gabarito
   da próxima busca — e um gabarito é tão bom quanto o caso que o gerou."*
   (`docs/insights.md:2778-2779`)
3. **A decisão escrita responde "isto é intencional?" e não responde "isto continua verdade?"**
   (`docs/insights.md:3143-3146`)
