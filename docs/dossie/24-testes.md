## 24. O que os testes garantem (e o que eles não garantem)

### 24.1 A suíte: o que é, como roda, quanto mede

O comando é `tsx --test 'src/**/*.test.ts'` (`package.json:13`). As aspas simples
em volta do glob são carga funcional e estão presas por um teste próprio
(`src/layers.test.ts:99-113`): sem elas o shell expande `**` como um nível só e
os arquivos de teste que ficam na **raiz** de `src/` nunca rodam — foi o defeito
que `src/layers.test.ts` descobriu sobre si mesmo, e um teste que nunca roda é
indistinguível de um teste que passa.

Não existe framework: o corredor é o `node:test` embutido, o `assert` é o
`node:assert/strict`, e o TypeScript é executado direto por `tsx`. Não há
`jest`, `vitest`, `mocha`, `testing-library` nem mock library em
`package.json`. Não existe nenhum arquivo `*.test.tsx` — **nenhum componente
React é renderizado em teste** (ver 24.11).

Números medidos nesta auditoria (não afirmados):

| medida | valor | como foi obtido |
|---|---|---|
| arquivos `*.test.ts` | **42** | `find src -name '*.test.ts' \| wc -l` |
| chamadas `test(...)` no topo de linha | **338** | `grep -c '^test('` somado |
| linhas de teste | **10.360** | `wc -l` somado |
| aprovados / reprovados | **338 / 0** | `npm test` |
| duração | **9,7 s** | `# duration_ms 9688.399059` na saída do corredor |

O número 338 não é decorativo: `src/bar.test.ts:128` o **deriva** contando
`^test(` em todo arquivo sob `src/` e exige que `docs/roadmap.md` diga o mesmo
(`docs/roadmap.md:45` — `| \`npm test\` | **338** testes |`). Acrescentar um teste
sem atualizar o plano reprova a suíte.

#### As cinco técnicas, e quais arquivos usam cada uma

Toda a suíte se reduz a cinco maneiras de provar algo. Saber qual está em uso é
saber o que aquele arquivo **pode** e **não pode** afirmar.

| técnica | o que ela prova | o que ela não prova | arquivos |
|---|---|---|---|
| **T1 — aritmética pura** (importa a função, chama, compara) | que a conta está certa para os exemplos escolhidos | que alguma tela chama a função | todo `src/domain/*.test.ts`, `src/i18n/i18n.test.ts`, `src/theme/scheme.test.ts`, `src/notify/phrase.test.ts`, `src/sync/serialize.test.ts`, `src/weather/weather.test.ts`, `src/assistant/assistant.test.ts` |
| **T2 — banco de verdade em memória** (`node:sqlite` `DatabaseSync(':memory:')` por trás da interface `Db`, migrado pelo migrador do aplicativo) | que o SQL roda, que as chaves estrangeiras mordem, que o saldo é soma | nada sobre Postgres, RLS ou rede | `src/data/repository.test.ts`, `src/data/schema.test.ts`, `src/data/db.test.ts`, `src/data/simulate.test.ts`, `src/sync/sync.test.ts`, `src/sync/columns.test.ts`, `src/notify/facts.test.ts` |
| **T3 — `grep` no código-fonte** (lê `.ts`/`.tsx` com `readFileSync` e casa expressão) | que um padrão proibido não existe em nenhum arquivo, inclusive num arquivo novo | que a tela **faz** a coisa certa — só que ela não faz a errada | `src/law.test.ts`, `src/layers.test.ts`, `src/language.test.ts`, `src/dictionary.test.ts`, `src/selectors.test.ts`, `src/components/confirm.test.ts`, `src/theme/contrast.test.ts`, `src/data/outbox.test.ts`, `src/data/erase.test.ts` (parte), `src/sync/agreement.test.ts` |
| **T4 — dois artefatos lidos e comparados** (esquema do servidor × serializador; script × prosa; dicionário × seletores do e2e) | que dois lados de um contrato concordam | que o contrato está certo — só que é o mesmo dos dois lados | `src/sync/agreement.test.ts`, `src/sync/columns.test.ts`, `src/bar.test.ts`, `src/selectors.test.ts`, `src/data/outbox.test.ts` |
| **T5 — dublê com estado observável** (objeto que grava o que foi pedido) | que nada foi escrito sem confirmação humana | que a escrita real funciona | `src/assistant/assistant.test.ts`, `src/weather/weather.test.ts`, `src/sync/sync.test.ts` (transporte falso) |

A ponte T2 aparece copiada em sete arquivos porque cada um a quer isolada. A
forma é sempre esta (`src/data/repository.test.ts:87-113`): `getAllAsync`,
`getFirstAsync`, `runAsync`, `execAsync` e `withTransactionAsync` sobre um
`DatabaseSync(':memory:')`, com `undefined` traduzido para `null` na ligação de
parâmetros, e `withTransactionAsync` fazendo `BEGIN` / `COMMIT` / `ROLLBACK` de
verdade. Chaves estrangeiras vêm ligadas por padrão no SQLite do Node, e o
comentário do arquivo diz por que isso importa: "a ordem de apagar só tem
sentido se as referências realmente valerem"
(`src/data/repository.test.ts:88-89`).

#### Inventário completo, por tamanho

| arquivo | testes | linhas | técnica |
|---|---|---|---|
| `src/data/repository.test.ts` | 74 | 3.388 | T2 |
| `src/assistant/assistant.test.ts` | 34 | 789 | T5 + T1 |
| `src/domain/recipe.test.ts` | 24 | 518 | T1 |
| `src/layers.test.ts` | 14 | 542 | T3 |
| `src/sync/agreement.test.ts` | 12 | 436 | T4 |
| `src/domain/pipeline.test.ts` | 12 | 297 | T1 |
| `src/weather/weather.test.ts` | 11 | 210 | T1 + T5 |
| `src/sync/serialize.test.ts` | 11 | 159 | T1 |
| `src/data/erase.test.ts` | 10 | 307 | T3 + T1 |
| `src/sync/sync.test.ts` | 9 | 241 | T2 + T5 |
| `src/domain/money.test.ts` | 8 | 121 | T1 |
| `src/domain/day.test.ts` | 8 | 111 | T1 |
| `src/domain/alerts.test.ts` | 8 | 275 | T1 |
| `src/i18n/i18n.test.ts` | 7 | 191 | T1 + T4 |
| `src/domain/access.test.ts` | 7 | 95 | T1 |
| `src/domain/number.test.ts` | 6 | 62 | T1 |
| `src/domain/units.test.ts` | 5 | 87 | T1 |
| `src/domain/qr.test.ts` | 5 | 90 | T1 |
| `src/domain/cost.test.ts` | 5 | 131 | T1 |
| `src/domain/agreement.test.ts` | 5 | 58 | T1 |
| `src/theme/scheme.test.ts` | 4 | 47 | T1 |
| `src/language.test.ts` | 4 | 145 | T3 |
| `src/domain/spark.test.ts` | 4 | 67 | T1 |
| `src/domain/briefing.test.ts` | 4 | 70 | T1 |
| `src/data/db.test.ts` | 4 | 157 | T2 |
| `src/bar.test.ts` | 4 | 175 | T4 |
| `src/theme/contrast.test.ts` | 3 | 132 | T3 + T1 |
| `src/selectors.test.ts` | 3 | 153 | T4 |
| `src/notify/phrase.test.ts` | 3 | 96 | T1 |
| `src/notify/facts.test.ts` | 3 | 206 | T2 |
| `src/domain/picking.test.ts` | 3 | 66 | T1 |
| `src/domain/measure.test.ts` | 3 | 33 | T1 |
| `src/domain/lot.test.ts` | 3 | 42 | T1 |
| `src/data/simulate.test.ts` | 3 | 122 | T2 |
| `src/data/schema.test.ts` | 3 | 141 | T2 |
| `src/release.test.ts` | 2 | 55 | T4 |
| `src/law.test.ts` | 2 | 175 | T3 |
| `src/dictionary.test.ts` | 2 | 89 | T3 |
| `src/data/outbox.test.ts` | 2 | 71 | T3 + T4 |
| `src/components/confirm.test.ts` | 2 | 63 | T3 |
| `src/sync/columns.test.ts` | 1 | 123 | T2 + T4 |
| `src/domain/ledger.test.ts` | 1 | 24 | T1 |

---

### 24.2 Os testes de arquitetura — a Lei da Inteligência virada em código

Estes não testam função nenhuma. Eles leem o **repositório** e reprovam se ele
tem uma forma proibida. Todos são T3 ou T4, e todos existem por uma razão
comum, escrita em `src/law.test.ts:12-13`: *"a lei mora num arquivo de texto e o
texto não roda"*.

#### 24.2.1 `src/law.test.ts` — 2 testes, 175 linhas

**Regra protegida: Lei da Inteligência, item 3 — nenhum número aparece
sozinho.** Implementado e ativo.

**Técnica.** Varre `app/` e `src/home/` recursivamente atrás de arquivos `.tsx`
(`src/law.test.ts:123-135`), remove comentários da fonte (`src/law.test.ts:114-116`
— `/* */` e `//`, porque "comentário fala de `type.figure` à vontade; só o que
roda conta") e conta quantas vezes a string `type.figure` aparece
(`src/law.test.ts:36`, `src/law.test.ts:119-121`). `type.figure` é o estilo do
número grande — o número que a tela existe para dizer.

**Por que registro e não heurística.** O docblock explica a alternativa
recusada (`src/law.test.ts:15-20`): exigir mecanicamente que todo `type.figure`
venha acompanhado de algo alarma errado, porque num formulário o número grande é
o que a pessoa está digitando agora e a comparação dele é o próprio formulário —
"alarme inventado ensina a ignorar alarme", que é o item 7 da mesma lei.

**A régua é por NÚMERO, não por arquivo — e isso é cicatriz.** A versão anterior
aprovava o arquivo inteiro com uma declaração só: `src/home/Mosaic.tsx` passava
verde por comparar a produção com ontem enquanto as caixas, as corridas abertas
e as entregas do dia apareciam nuas ao lado — **nove figuras nunca conferidas
por nada** (`src/law.test.ts:26-32`). Hoje a contagem tem que bater exatamente.

**O registro `TELAS`** (`src/law.test.ts:45-111`) é um `Record<string,
Declaracao | Declaracao[]>` onde `Declaracao` é `{ compara: RegExp }` ou
`{ sozinho: string }` (`src/law.test.ts:38-42`). Transcrito na íntegra, porque é
o mapa de qual comparação cada número da interface deve ter:

| tela | nº | declaração |
|---|---|---|
| `src/home/Mosaic.tsx` | 1 | `compara: /noYesterday|madeYesterday/` |
| `src/home/Mosaic.tsx` | 2 | `sozinho`: "o número é uma contagem regressiva — '3 dias · Polpa' já é a distância até o fim. Contagem regressiva compara com o limite dela, e um 'ontem' ao lado só atrapalharia." |
| `src/home/Mosaic.tsx` | 3 | `compara: /noBoxesYesterday|boxesYesterday/` |
| `src/home/Mosaic.tsx` | 4 | `compara: /warmerBy|weather\.same/` |
| `src/home/Mosaic.tsx` | 5 | `sozinho`: "o número é quantos tachos estão abertos AGORA. Estado ao vivo responde a segunda pergunta da lei (o que está diferente), e zero é o normal — o pulso ao lado diz se anda." |
| `src/home/Mosaic.tsx` | 6 | `compara: /coverDays|coverTightest/` |
| `src/home/Mosaic.tsx` | 7 | `sozinho`: "o número é quantas entregas do dia ainda não saíram: uma lista de afazeres de hoje, que se compara com o próprio acordo de dia, e não com ontem." |
| `src/home/Mosaic.tsx` | 8 | `compara: /lossVsBefore|lossFirst/` |
| `src/home/Mosaic.tsx` | 9 | `compara: /Sparkline/` |
| `src/home/Mosaic.tsx` | 10 | `compara: /heldDetail|coverDays/` |
| `app/(tabs)/production.tsx` | 1 | `compara: /vsYesterday|noYesterday/` |
| `app/(tabs)/reports.tsx` | 1 | `compara: /coverDays|placeCount/` |
| `app/(tabs)/reports.tsx` | 2 | `compara: /Sparkline/` |
| `app/(tabs)/reports.tsx` | 3 | `compara: /lossVsBefore|lossFirst/` |
| `app/(tabs)/transport.tsx` | 1 | `compara: /vsYesterday|firstDay/` |
| `app/places.tsx` | 1 | `compara: /worth/` |
| `app/recipes/index.tsx` | 1 | `compara: /orderedByBatch/` |
| `app/inputs/index.tsx` | 1 | `compara: /shortestCover|coverUnknown|coverComfortable/` |
| `app/inputs/[id].tsx` | 1 | `compara: /wentUp|wentDown/` |
| `app/losses.tsx` | 1 | `compara: /vsPrevious|firstWindow/` |
| `app/recipes/[id].tsx` | 1 | `compara: /summaryCheaper|summaryDearer|delta/` |
| `app/lots/[id].tsx` | 1 | `sozinho`: "o número grande é o CÓDIGO do lote, não uma medida. Código não tem mais nem menos, e comparar dois códigos não decide nada." |
| `app/purchase.tsx` | 1 | `sozinho`: "formulário: o número é o total da nota que a pessoa está digitando agora. A comparação dele é a própria nota na mão dela." |
| `app/inputs/new.tsx` | 1 | `sozinho`: "formulário: o número é o custo que acabou de ser digitado, ainda não é história." |
| `app/products/new.tsx` | 1 | `sozinho`: "formulário: o número é o rendimento que a pessoa está definindo agora." |
| `app/production/new.tsx` | 1 | `sozinho`: "formulário: o número é o que a corrida vai gravar. O que ela vai custar aparece na confirmação, antes de virar história." |

**Teste 1 — `every headline number says what it is being compared against`**
(`src/law.test.ts:137-164`). Três asserções em cascata, por tela:
1. a tela está no registro, ou reprova com a mensagem "mostra um número grande e
   não está em `src/law.test.ts`" (`src/law.test.ts:140-145`);
2. `lista.length === quantos` — o número de declarações é exatamente o número de
   `type.figure` no arquivo (`src/law.test.ts:149-155`);
3. cada `compara` casa com a fonte do arquivo, e cada `sozinho` tem **mais de 40
   caracteres** — "o motivo tem que ser um motivo" (`src/law.test.ts:156-162`).

**Teste 2 — `the registry does not outlive the screens`**
(`src/law.test.ts:166-175`): toda tela declarada tem de continuar mostrando
número grande, "senão o registro vira lista de telas que não existem mais".

**O que ele NÃO prova:** que a comparação declarada está *ao lado* do número, ou
que ela é a comparação certa. Ele prova que existe no arquivo um identificador
que a nomeia.

#### 24.2.2 `src/layers.test.ts` — 14 testes, 542 linhas

O maior guarda de fonte do repositório. Sete regras distintas, cada uma com um
teste positivo (o repositório não viola) e, em cinco delas, um **teste de
mordida** (a régua reprova a cicatriz real e absolve o conserto). Todos T3.

**Regra 1 — só a camada de dados fala SQL.**
Padrão: `SQL = /\b(SELECT\s+[\s\S]*?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[\s\S]*?\bSET\b|DELETE\s+FROM\b)/i`
(`src/layers.test.ts:21`). As pastas cobertas são **descobertas, não listadas**
(`src/layers.test.ts:49-54`): `['app', ...tudo em src/ que é diretório e não é
'data']`. O comentário diz por quê: a lista era escrita à mão e "a pasta NOVA
nasce fora da regra — `src/weather` foi criada e a checagem continuou verde sem
nunca ter olhado para ela" (`src/layers.test.ts:41-48`).

Uma exceção: `PROSA = /^src\/i18n\/locales\//` (`src/layers.test.ts:71`). O
motivo é um alarme falso que aconteceu: o padrão de `UPDATE ... SET` atravessa
linhas de propósito, e num arquivo de idioma a palavra "update" numa frase casou
com "set" vinte linhas depois (`src/layers.test.ts:56-70`). "Alarme falso num
guard é pior que guard ausente: ensina a ignorar a saída dele."

- `only the data layer speaks SQL` (`src/layers.test.ts:73-89`)
- `the data layer is where SQL actually is, so the test above means something`
  (`src/layers.test.ts:91-97`) — **o canário anti-vacuidade**: exige
  `withSql.length >= 3` em `src/data`. "Uma regra que passaria num repositório
  vazio não prova nada."
- `the suite runs every test file, whatever folder it lands in`
  (`src/layers.test.ts:99-113`) — lê `package.json` e exige que o glob esteja
  entre aspas.
- `the prose exclusion is narrow, and the guard still bites next door`
  (`src/layers.test.ts:115-129`) — `PROSA` casa `src/i18n/locales/pt-BR.ts` e
  **não** casa `src/i18n/index.ts` ("o código do i18n continua coberto"); e
  `SQL` continua achando `SELECT id\n FROM items` e
  `UPDATE products\n SET name = ?`, e não acha "a frase diz que o app se
  atualiza sozinho e o campo fica set".

**Regra 2 — nenhuma tela escreve frase própria.** Cicatriz nomeada
(`src/layers.test.ts:131-152`): `WhySheet` — a folha que abre a conta de toda
conclusão, a Lei 6 em pessoa — tinha "Custo do lote", "Perda prevista" e
"Fechar" cravados em português; uma fábrica em espanhol via a interface
traduzida e recebia português no instante em que pedia a prova do número. O
`Widen<T>` não pega isso: ele obriga a CHAVE a existir nos três dicionários, não
obriga a tela a usá-la.

A régua é a **palavra funcional**, e a escolha tem história de cinco minutos: a
primeira versão procurava acento e se dizia capaz de ter pegado o `WhySheet` —
"Custo do lote" não tem acento nenhum, então o guard passaria verde na própria
cicatriz que cita (`src/layers.test.ts:139-145`).

```
PALAVRAS = ['do','da','de','no','na','em','para','por','com','que']   (layers.test.ts:153)
```

`pareceFrase(linha)` (`src/layers.test.ts:166-174`): pega literais de 4+
caracteres entre `'`, `"` ou backtick; troca `${...}` por espaço; exige espaço;
**recusa** se contiver `/` ou `=`; e então casa palavra funcional com `\b`.
As três condições saíram de três alarmes falsos, cada um custando uma rodada
(`src/layers.test.ts:157-164`): `'as'` na lista acusava `as Draft['kind']`
porque `as` é palavra-chave do TypeScript; sem exigir espaço, `'input'` casava;
sem excluir caminho, `'@/domain/day'` casava com "do".

As pastas que desenham são `['app', 'src/components', 'src/home', 'src/notify']`
(`src/layers.test.ts:177-182`) — "`src/data` semeia exemplo, e exemplo é dado".
Linhas ignoradas: `import`, `from '@…'`, `router.push`, `router.replace`,
`getByLabel`, `goto(` (`src/layers.test.ts:195`).

- `no screen writes a sentence of its own` (`src/layers.test.ts:184-208`)
- `the sentence guard bites the real scar, and leaves identifiers alone`
  (`src/layers.test.ts:210-228`): reprova `<Text>{'Custo do lote'}</Text>` e
  `const titulo = "Perda prevista no lote";`; absolve o comentário, o
  `as Draft['kind']`, `'temperature'`, o caminho de import e a interpolação
  `` `${formatQuantity(l.baseUnits, locale)} ${l.unit}` ``.

**Regra 3 — o aviso de validade nunca é preso a uma sala.**
`no screen scopes the expiry warning to a single room` (`src/layers.test.ts:256-281`).
Casa `/(?<!function )expiringSoon\(([^)]*)\)/g` em todo `app/` e `src/`; se a
chamada tem **4 ou mais argumentos**, o quarto é a sala e a tela reprova. O
`(?<!function )` tira a declaração da função em `repository.ts`, que também casa
e tem quatro parâmetros — "sem isto a guarda acusa a própria função que ela
existe para proteger" (`src/layers.test.ts:263-265`).

A explicação do defeito é o coração da regra (`src/layers.test.ts:232-241`):
`expiringSoon` está certa — sem sala responde pela empresa inteira. Quem errava
eram os dois chamadores (a capa e o alarme do celular), que passavam o
almoxarifado. A soma por local de um lote que **saiu** do almoxarifado dá zero
ali, e o `HAVING SUM(...) > 0` o descarta: o filtro silenciava o aviso
exatamente no dia em que o picolé ia para a câmara fria — que, numa fábrica de
picolés, é o dia seguinte ao de produzi-lo.

Por que guarda de fonte e não teste de unidade, dito por extenso
(`src/layers.test.ts:243-254`): "o defeito não está em nenhuma função: está no
argumento que uma tela passa. Um teste de unidade chamando `expiringSoon`
diretamente passa nos dois mundos — foi o que aconteceu: escrevi o teste da
regra, ele passou, e a mutação que devolvia o filtro à capa ATRAVESSOU a suíte
inteira." **O que ele não prova:** que a capa desenha o aviso. Prova que ela não
o restringe a uma sala.

**Regra 4 — a sala que a contagem grava é a sala que a tela mostrou.**
Função exportada `contagemCega(texto): string[]` (`src/layers.test.ts:309-320`):
casa `/recordCount\(([\s\S]{0,400}?)\)\s*;/g`, extrai
`locationId:\s*([^,\n]+)`, e acusa se o valor casar
`/\w\(|LOCAL_COMPANY_ID|companyId/` — isto é, se for **chamada de função** ou a
constante da empresa.

A cicatriz (`src/layers.test.ts:285-296`): `app/inputs/[id].tsx` mostrava
`item.onHandBaseUnits` (o total da EMPRESA, porque `findItem` era chamada sem
sala) e gravava a diferença com `locationId: defaultLocationId(...)`, o
almoxarifado. Com a polpa dividida entre fábrica e câmara fria, contar a
prateleira da fábrica "encontrava" uma falta do tamanho exato do que estava na
câmara e gravava essa falta contra a fábrica: **estoque teleportado, com o
operador tendo feito tudo certo**, e o livro-razão guardando a mentira para
sempre — contagem não se apaga, se estorna.

- `no screen counts a room it did not show` (`src/layers.test.ts:322-339`)
- `the counting guard bites the real scar, and leaves the fix alone`
  (`src/layers.test.ts:341-368`): reprova a linha exata que existia
  (`locationId: defaultLocationId(LOCAL_COMPANY_ID)`) e a variante
  `locationId: LOCAL_COMPANY_ID`; absolve `locationId: contarEm` (valor que a
  tela calculou) e absolve chamada sem `locationId` nenhum, "porque quem exige o
  campo é o tipo, e ele já reprova na compilação".

**Regra 5 — as salas que o SQL chama de nossas são as que o domínio chama de
nossas.** `the rooms SQL calls ours are the rooms the domain calls ours`
(`src/layers.test.ts:382-399`). Lê `src/data/repository.ts`, casa
`/l\.kind IN \(([^)]*)\)/g`, e compara cada lista ordenada com
`[...INTERNAL_PLACE_KINDS].sort()` importado de `src/domain/ledger`. O valor real
é `INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room']`
(`src/domain/ledger.ts:68`). O canário está lá: `noSql.length > 0`, "senão a
comparação seria de graça". Divergir "é prometer mercadoria que está numa loja,
ou esconder a que está na câmara" (`src/layers.test.ts:380`).

**Regra 6 — a tela que produz lê o piso da sala em que o tacho roda.**
Função exportada `pisoDeOutraSala(texto): string[]`
(`src/layers.test.ts:417-429`): só age em arquivos que contenham
`recordProduction(`; então casa `/listItems\(([^)]*)\)/g` e acusa toda chamada
com **menos de 4 argumentos** — a assinatura é `(companyId, tipo, inativos,
sala)`, e sem o quarto o saldo é o da empresa.

A cicatriz (`src/layers.test.ts:403-413`): `recordProduction` confere o piso da
SALA porque somar todos os lugares deixava "mandar um saco de açúcar para a loja
autorizar um tacho com o açúcar que está a dez quilômetros". A tela continuou
lendo `listItems(LOCAL_COMPANY_ID)` para decidir se libera o botão — com a polpa
na câmara fria, a tela dizia que havia polpa, liberava o botão, e **toda**
corrida batia no piso do livro-razão com um erro de programador em inglês.

- `a screen that produces reads the floor of the room the kettle is in`
  (`src/layers.test.ts:431-448`)
- `the production floor guard bites the real scar, and leaves the fix alone`
  (`src/layers.test.ts:450-468`): reprova `listItems(LOCAL_COMPANY_ID)` num
  arquivo que produz; absolve
  `listItems(LOCAL_COMPANY_ID, undefined, false, defaultLocationId(LOCAL_COMPANY_ID))`;
  e absolve `listItems(LOCAL_COMPANY_ID)` num arquivo que **não** produz — "a
  lista do almoxarifado lê a empresa inteira de propósito, e está certa".

**Regra 7 — nenhum por cento montado à mão.**
Função exportada `porCentoNaMao(texto): string[]` (`src/layers.test.ts:489-500`):
linha por linha, casa `/\*\s*100\s*\)?\s*\.toFixed\(/` **e** exige que a linha
contenha `%`. As duas condições juntas, porque sem o `%` a régua acusava dois
inocentes: o próprio docblock de `formatPercent`, que cita o padrão em prosa, e
a tela da receita, que arredonda e entrega o número ao `formatTyped` — que sabe
o idioma (`src/layers.test.ts:491-495`).

A cicatriz é de conserto pela metade (`src/layers.test.ts:472-487`):
`formatPercent` nasceu quando a capa anunciava "9.0%" para uma fábrica
brasileira, e o docblock dela dizia "existia em três lugares", no passado — e
três lugares continuavam assim: a tela do insumo (duas vezes), a tela da compra,
e o assistente, este com `.replace('.', ',')`, que acerta em português e **erra
no espanhol do México, onde o separador decimal É o ponto**.

- `no screen builds a percentage by hand` (`src/layers.test.ts:502-519`)
- `the percentage guard bites the real scar, and leaves honest toFixed alone`
  (`src/layers.test.ts:521-541`): reprova `` `${(Math.abs(change) * 100).toFixed(1)}%` ``
  e `` `${(cost.lossFraction * 100).toFixed(1).replace('.', ',')}%` ``; absolve
  `rate: parsed.unitRate.toFixed(4)` ("taxa não é porcentagem"),
  `` `${batches.toFixed(2)} (pelo que saiu)` `` ("tacho não é porcentagem"),
  o `formatTyped(Number((stored.lossFraction * 100).toFixed(2)), …)` e a prosa
  do docblock.

#### 24.2.3 `src/dictionary.test.ts` — 2 testes, 89 linhas

**Regra: toda seção do dicionário tem quem a leia, ou um motivo escrito.**
Implementado e ativo. Técnica T3.

**Como.** Importa `ptBR` de `src/i18n/locales/pt-BR`, concatena o texto de **todo**
arquivo `.ts`/`.tsx`/`.mjs` de `app/` e `src/` que não contenha `locales` no
caminho (`src/dictionary.test.ts:51-60`), e para cada chave de primeiro nível de
`ptBR` procura a expressão `t\.<seção>\b` nesse texto
(`src/dictionary.test.ts:66-68`).

**A doença tem número.** O `CLAUDE.md` cita "quatro seções de dicionário nos três
idiomas sem uma tela"; quando o dicionário foi varrido de novo eram **sete**
(`src/dictionary.test.ts:10-14`). Quatro saíram porque eram rascunho anterior já
substituído: `areas` nomeava um menu de oito áreas que não existe, e
`production`, `confirmation` e `assistant` diziam em outras palavras o que
`app.production`, `app.transfer.confirmBody` e `app.assistant` já dizem
(`src/dictionary.test.ts:20-25`).

**O custo, dito por extenso** (`src/dictionary.test.ts:16-19`): "uma seção morta
parece viva: quem for renomear 'Custo desta produção' acha primeiro a cópia que
ninguém lê, muda ali, e a tela continua dizendo o que dizia — com o commit
verde, o teste verde e o dono apontando o texto velho na semana seguinte."

**As três fronteiras registradas** (`src/dictionary.test.ts:41-48`), transcritas:

| seção | motivo escrito |
|---|---|
| `posts` | "os quatro postos de controle (separado, carregado, entregue, conferido) — escopo da F3 escrito no plano do mês, no CLAUDE.md" |
| `stepper` | "o UnitStepper, componente da Fase 2 — decisão registrada no CLAUDE.md, e apontá-lo como defeito já custou uma rodada" |
| `scan` | "a leitura do QR do engradado na doca — o QR já é impresso na etiqueta do lote; quem lê ainda não existe" |

- `every dictionary section has a reader, or a written reason`
  (`src/dictionary.test.ts:62-78`), com canário `secoes.length > 5`.
- `the frontier list only holds sections that are still unread`
  (`src/dictionary.test.ts:80-88`): cada fronteira ainda existe em `ptBR`, ainda
  **não** tem leitor, e o motivo tem mais de 40 caracteres — "a fronteira precisa
  dizer QUEM vai ler, não só que espera".

**O que ele NÃO confere, dito no próprio arquivo** (`src/dictionary.test.ts:27-31`):
ele mede **seção**, não chave. "Uma varredura por chave acusou 44 folhas sem
leitor aparente, e boa parte é falso positivo do detector (leitura por índice
dinâmico, chave montada)."

#### 24.2.4 `src/language.test.ts` — 4 testes, 145 linhas

**Regra: a mesma língua visual em todas as telas.** Implementado e ativo.
Técnica T3.

**Origem.** O dono abriu o aplicativo depois de a capa ser redesenhada e disse
"os temas antigo e os novos estão se sobrepondo". Não era bug de tema — "era que
uma tela tinha sido redesenhada e vinte não" (`src/language.test.ts:8-16`). A
ordem que veio junto vale para tudo o que o arquivo protege: **destrói-se o
layout antigo para pôr o novo por cima**, nunca se acrescenta um caminho novo ao
lado do velho (`src/language.test.ts:18-21`).

As réguas, literais:

```
DESENHO  = /from '@\/components\/(Glyph|icons|Sky|Landscape|FactoryScene)'/   (language.test.ts:28)
ANIMACAO = /\bReveal\b/                                                       (language.test.ts:31)
HEX      = /#[0-9a-fA-F]{6}\b/g                                               (language.test.ts:63)
```

O universo é `telasEm('app')` menos os `_layout.tsx`, "que não desenham nada"
(`src/language.test.ts:86`).

- `every screen draws something - no screen is a wall of paragraphs`
  (`src/language.test.ts:88-102`).
- `every screen comes in animated, like the cover does`
  (`src/language.test.ts:104-116`) — "uma tela que não entra parece de outro
  aplicativo no toque seguinte".
- `no screen invents a colour` (`src/language.test.ts:118-131`) — cor crua de 6
  dígitos hexadecimais reprova, a menos que a tela esteja em `TINTA_PROPRIA`
  com motivo de mais de 40 caracteres.
- `the pending list only shrinks, and never outlives the screens`
  (`src/language.test.ts:133-145`).

**Dois registros.** `DELEGAM` (`src/language.test.ts:39-41`) tem uma entrada:
`'app/(tabs)/index.tsx' → 'src/home/Mosaic.tsx'` — a tela não desenha por si
porque delega a tela inteira, e o teste confere que o destino desenha.
`TINTA_PROPRIA` (`src/language.test.ts:66-69`) tem uma:
`'app/lots/[id].tsx'` → "a etiqueta é papel branco com tinta preta em qualquer
tema, porque é o que sai da impressora — o tema da tela não muda a cor da tinta."

**`FALTAM` está vazio desde 4 de setembro** (`src/language.test.ts:55`,
`src/language.test.ts:44-54`). Começou com **vinte e três** telas e chegou a
zero. Fica no arquivo porque "vazia ela vale mais que cheia": daqui em diante
toda tela nova é medida pelas três regras desde a primeira linha, sem carência, e
acrescentar um nome ali é declarar que uma tela está fora da língua.

#### 24.2.5 `src/selectors.test.ts` — 3 testes, 153 linhas

**Regra: todo texto que o e2e procura existe no dicionário.** Implementado e
ativo. Técnica T4 (dicionário × `e2e/flow.mjs`).

**A cicatriz** (`src/selectors.test.ts:9-16`): o rótulo `howMany` deixou de ser
"Quantas {{pack}}" (que saía como "QUANTAS SACO 25 KG") e virou "Quantidade, em
{{pack}}" — e três checagens do e2e continuaram procurando `/Quantas/`. Elas não
falham na hora: **esperam trinta segundos por um campo que não existe mais e o
CI fica vermelho vinte minutos depois**, por causa de uma palavra trocada num
arquivo de tradução. E o portão de entrega não pega: `verify.sh` roda tipo, lint
e unidade, e o e2e não está nele (`src/selectors.test.ts:21-22`).

**Como.** Achata toda folha de `ptBR` numa lista de frases
(`src/selectors.test.ts:31-39`), remove os marcadores `{{\w+}}`
(`src/selectors.test.ts:62`) e lê `e2e/flow.mjs` como texto
(`src/selectors.test.ts:64`). Extrai duas famílias de seletor:

- **literais** — `getByText('…', { exact: true })` e `getByLabel('…')`
  (`src/selectors.test.ts:91-94`), com `\'` desescapado;
- **expressões** — `getByLabel(/…/)` e `getByText(/…/)`
  (`src/selectors.test.ts:97-99`).

Literal reprova se nenhuma frase for igual a ele **ou o contiver**; expressão
reprova se nenhuma frase casar com `new RegExp(fonte)`.

**Canário duro, e ele é cicatriz da própria guarda** (`src/selectors.test.ts:41-52`):
se `DICIONARIO.length < 100`, o arquivo **lança na carga** com a mensagem "o
dicionário chegou com N frases — esta guarda compara contra ele, e comparar
contra uma lista vazia reprova tudo pelo motivo errado". O import começou como
`default`, o dicionário chegou indefinido, e "o primeiro seletor da lista levava
a culpa por um erro que não era dele". Mais dois canários por teste:
`LITERAIS.length > 20` e `EXPRESSOES.length > 5`.

**A lista de renúncias `NAO_E_DICIONARIO`** (`src/selectors.test.ts:74-88`) —
texto que a tela **monta** e por isso nunca casará. Transcrita:

| texto/expressão | motivo |
|---|---|
| `Picolé de morango` | nome de produto do exemplo semeado, não frase de tela |
| `Açúcar cristal` | nome de insumo do exemplo semeado, não frase de tela |
| `Polpa de morango` | nome de insumo do exemplo semeado, não frase de tela |
| `Apagar Produtos` | rótulo de acessibilidade montado com o nome da área pela tela |
| `Uva` | sabor que a própria checagem cadastra antes de tocar nele |
| `Picolé de Uva` | nome composto pela grade — linha, tipo e sabor — e não escrito em lugar nenhum |
| `máxima` | metade de um rótulo composto na tela do lugar |
| `mínima` | metade de um rótulo composto na tela do lugar |
| `^\d{8}-\d{2}$` | o formato do código do lote, gerado pelo domínio e não traduzido |
| `^Tempo: (Esconder\|Mostrar)$` | rótulo de acessibilidade montado pela capa com o nome da peça mais a ação |
| `English` | nome de idioma escrito NA língua dele, de propósito: quem procura o próprio idioma numa lista o reconhece escrito como ele se escreve, e não precisa saber ler o idioma atual para achar o seu |

- `every literal the e2e clicks on still exists in the dictionary`
  (`src/selectors.test.ts:108-124`)
- `every pattern the e2e searches for still matches something the app can say`
  (`src/selectors.test.ts:126-140`)
- `the exceptions list only holds exceptions that are still used`
  (`src/selectors.test.ts:142-153`) — renúncia órfã reprova, e o motivo precisa
  de mais de 20 caracteres.

Os dois primeiros acumulam **todos** os órfãos antes de reprovar, e a razão está
escrita (`src/selectors.test.ts:101-107`): "`assert` para no primeiro, e quem
renomeia uma chave costuma quebrar três seletores juntos — senão o conserto vira
três rodadas."

**Só o pt-BR** (`src/selectors.test.ts:27`): é o idioma em que a suíte dirige o
aplicativo. **O que ele não prova:** que a tela mostra aquele texto — "isso é
trabalho do navegador"; prova que o texto existe no aplicativo
(`src/selectors.test.ts:23-25`).

#### 24.2.6 `src/bar.test.ts` — 4 testes, 175 linhas

**Regra: todo número que o projeto afirma sobre si mesmo é derivado do sistema.**
Implementado e ativo. Técnica T4.

**Duas cicatrizes no mesmo dia** (`src/bar.test.ts:9-14`): o `CLAUDE.md` dizia
"Postgres descartável, **oito** garantias" no dia em que o `db:verify` passou a
ter nove; e a tabela de `docs/roadmap.md`, escrita naquela manhã sob o título "onde
o produto está hoje — medido, não afirmado", estava velha em quatro linhas antes
do fim da tarde. "Um comando escrito é um convite, não uma garantia: ninguém roda
quinze comandos antes de acreditar numa tabela" (`src/bar.test.ts:19-21`).
**Este arquivo é aquela coluna, executada. O lado que manda é sempre o sistema;
o documento é o que pode estar errado** (`src/bar.test.ts:23-24`).

`GARANTIAS` = contagem de `^echo "==> check ` em `scripts/verify-migrations.sh`
(`src/bar.test.ts:71`). Hoje: **13**.

- `the database checks are numbered without a gap` (`src/bar.test.ts:75-83`):
  os números extraídos têm de ser exatamente `1..GARANTIAS`, sem pular nem
  repetir — "a saída fica impossível de acompanhar".
- `the script says how many guarantees it actually has` (`src/bar.test.ts:85-94`):
  a frase final do script, `all (\w+) guarantees hold`, tem de dizer o número
  **por extenso em inglês**, conferido contra a tabela `IN_WORDS`
  (`src/bar.test.ts:65-69`: zero…twenty).
- `CLAUDE.md states the number of guarantees the script really has`
  (`src/bar.test.ts:96-109`): casa `/Postgres descartável, (\w+) garantias/` e
  confere contra `POR_EXTENSO` em português (`src/bar.test.ts:60-64`:
  zero, uma, duas, três, quatro, cinco, seis, sete, oito, nove, dez, onze, doze,
  treze, quatorze, quinze, dezesseis, dezessete, dezoito, dezenove, vinte).
  "Não é história datada, é referência: quem ler começa a sessão com o número
  errado na cabeça."
- `every number the plan states about the system is the number the system has`
  (`src/bar.test.ts:153-175`): para cada linha da tabela `TABELA`, casa
  `^\| <rótulo> \| \*\*([\d.]+)\*\*` em `docs/roadmap.md` e compara com o valor
  derivado. Acumula todos os erros antes de reprovar.

**As dez linhas derivadas** (`src/bar.test.ts:121-132`), com a derivação exata e
o valor de hoje:

| rótulo no plano | derivação | valor |
|---|---|---|
| `telas` | `.tsx` sob `app/` que não começam com `_layout` | 24 |
| `tabelas no aparelho (SQLite)` | `CREATE TABLE IF NOT EXISTS` em `src/data/db.ts` | 21 |
| `tabelas no servidor (Postgres)` | `^create table ` em todas as migrações | 22 |
| `migrações do servidor` | `readdirSync('supabase/migrations').length` | 32 |
| `papéis` | `^ {2}[A-Za-z]+:` no corpo de `ROLES` em `src/domain/access.ts` | 7 |
| `capacidades` | `new Set([...access.ts.matchAll(/'([a-z_]+)'/g)]).size` | 18 |
| `` `npm test` `` | `^test(` somado em todo `src/**/*.test.ts` | 338 |
| `` `npm run mutate` `` | `^ {4}file: '` em `scripts/mutate.mjs` | 106 |
| `` `npm run e2e:fast` `` | `^check(` em `e2e/flow.mjs` | 36 |
| `` `npm run db:verify` `` | `GARANTIAS` | 13 |

**Um defeito medido nesta auditoria, e ele é real.** A derivação de
`capacidades` conta **todo** literal `'[a-z_]+'` em `src/domain/access.ts`, não
as capacidades. Verificado por execução: o conjunto de 18 é
`view_cost, view_sale_price, record_production, dispatch, check_receipt,
record_loss, place_order, approve_order, adjust_stock, view_finance,
issue_invoice, manage_company` (as 12 capacidades reais, `src/domain/access.ts:26-39`)
**mais** `owner, operator, driver, buyer, customer, salesperson` — seis dos sete
nomes de papel, porque `storeManager` tem maiúscula e não casa a régua. O plano
diz "capacidades: 18" e o sistema tem **12 capacidades e 7 papéis**. A guarda
está verde e o número que ela protege está errado.

**A fronteira honesta, escrita no próprio arquivo** (`src/bar.test.ts:113-120`):
"acrescentar uma linha à tabela sem acrescentar uma entrada aqui não quebra nada
— ela confere o que foi registrado, não descobre o que não foi." E
(`src/bar.test.ts:30-34`): "não roda o `db:verify` nem o `mutate` — isso custa um
Postgres e seis minutos. Um `mutate` que passasse a FALHAR não seria pego por
aqui."

#### 24.2.7 `src/release.test.ts` — 2 testes, 55 linhas

**Regra: o que sai no instalador é conferido aqui, não na memória de quem
publica.** Implementado e ativo. Técnica T4 (lê `app.json`).

- `the ledger does not leave the phone through the Android backup`
  (`src/release.test.ts:19-33`): exige `expo.android.allowBackup === false`.
  A razão é decisão de produto (`src/release.test.ts:20-27`): `allowBackup` é
  `true` por padrão no Android, e nesse estado o sistema copia o banco do
  aplicativo para a conta Google do aparelho. "O celular da fábrica é
  compartilhado por decisão escrita do dono, e costuma estar logado na conta de
  alguém: o livro-razão inteiro de uma empresa — custo, margem, cliente — sai
  dali para a nuvem pessoal de um operador, sem ninguém pedir nada." E nada se
  perde desligando: o backup de verdade é a fila para o servidor, "o único que a
  empresa controla".
- `the version can always produce a build number that grows`
  (`src/release.test.ts:35-55`). A fórmula do `versionCode` (aplicada em
  `build-apk.yml`) é `a * 1_000_000 + b * 10_000 + c * 100`. O teste quebra
  `expo.version` em três inteiros e exige `b < 100` e `c < 100`, porque a fórmula
  "só é monótona enquanto `b` e `c` cabem na faixa". A fórmula **anterior**
  (`a * 100_000 + b * 10_000 + c`) já colidia no alcance de hoje: **0.10.0 e
  1.0.0 davam 100000 os dois**, e o 0.10.0 está publicado
  (`src/release.test.ts:42-45`). A última asserção prende a continuidade:
  `a * 1_000_000 + b * 10_000 + c * 100 === 100_000` — a versão atual é 0.10.0 e
  continua valendo o `versionCode` com que já foi publicada.

"A intenção mora aqui, e a prova do artefato mora lá — o `build-apk.yml` confere
o manifesto GERADO, que é o que instala no celular" (`src/release.test.ts:10-13`).

#### 24.2.8 `src/components/confirm.test.ts` — 2 testes, 63 linhas

**Regra: nenhuma tela usa o `Alert` da plataforma, e toda tela que escreve
pergunta antes.** Implementado e ativo. Técnica T3.

**O bug que custou uma noite** (`src/components/confirm.test.ts:7-14`): `Alert`
não faz nada na web. Toda confirmação passava por `Alert.alert`, então num
navegador "o app fazia perguntas que ninguém via e esperava respostas que nunca
chegavam — salvar um insumo, lançar uma nota e apagar tudo silenciosamente não
faziam nada, e nenhum teste notou porque o código estava correto na plataforma em
que os testes não rodam".

- `no screen uses the platform Alert, which is a no-op on the web`
  (`src/components/confirm.test.ts:31-43`): reprova
  `/import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/` em qualquer
  `.ts`/`.tsx` sob `app/`. "O import é o que importa: `Alert` chegar a uma tela
  já é o bug."
- `every screen that writes something asks before it does`
  (`src/components/confirm.test.ts:45-63`): as telas que chamam
  `saveItem`, `saveProduct`, `saveRecipeVersion`, `recordPurchase`, `eraseArea`
  ou `restoreStarterData` **têm** de conter `useConfirm()`. Canário:
  `writers.length >= 5`.

"Não há como testar por unidade o diálogo de uma plataforma. O que se pode testar
é que o aplicativo nunca mais o procure" (`src/components/confirm.test.ts:16-19`).

---

### 24.3 Tema: contraste e luz da tela

#### 24.3.1 `src/theme/contrast.test.ts` — 3 testes, 132 linhas

**Regra: todo texto pequeno é legível no corredor da câmara, e isso é um número.**
Implementado e ativo. Técnica: T3 (lê `src/theme/tokens.ts` como texto) + T1 (a
matemática de contraste é calculada no próprio teste).

**A cicatriz, medida** (`src/theme/contrast.test.ts:7-15`): a auditoria mediu
`inkFaint` em **2,55:1** no tema que sai da caixa, com **124** corridas de texto
de 11 e 13 px pintadas com ele. "O rótulo que diz O QUE o número é ('valor
parado', 'por mil', 'conferido em') ficava ilegível exatamente onde o aplicativo
é usado: tela suja, luz de galpão, luva de frio. O número aparecia sozinho, o
que é o oposto da Lei 3."

As réguas, literais:

```
TINTAS = ['ink', 'inkMuted', 'inkFaint']      (contrast.test.ts:28)
FUNDOS = ['paper', 'surface', 'sunken']       (contrast.test.ts:30)
MINIMO = 4.5     // WCAG AA para texto normal (contrast.test.ts:32)
PASSO  = 1.35    // razão mínima entre camadas (contrast.test.ts:113)
```

A escolha de 4,5 e não 3:1 é justificada por medição
(`src/theme/contrast.test.ts:15-17`): "este projeto não tem texto grande o
bastante para a régua de 3:1 valer — a maior fonte de corpo é 15 px, e as três
camadas de tinta são usadas em 11, 13 e 15."

**A matemática é implementada no teste**, não importada
(`src/theme/contrast.test.ts:34-44`): luminância relativa da WCAG (canal / 255,
então `v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)^2.4`, pesos
`0.2126 / 0.7152 / 0.0722`), e `contraste(a,b) = (claro + 0.05) / (escuro + 0.05)`.

**Por que ler o arquivo em vez de importar os tokens**
(`src/theme/contrast.test.ts:19-23`): "importar traria os objetos já montados, e o
`Palette` do Papel herda campos do Orgânico por espalhamento: o teste passaria a
medir o que a herança produziu, não o que está escrito. Lendo o texto, cada
paleta é medida com a cor que alguém digitou ali — e uma cor nova, colada amanhã,
entra na medição sem ninguém acrescentar nada."

O extrator `paletas()` (`src/theme/contrast.test.ts:47-64`) casa
`const (\w*[Pp]alette|\w*(?:Claro|Escuro))[^=]*= \{`, corta até `\n};`, e
**descarta** o bloco se o corpo contiver outra declaração — cicatriz do
`const palettes = { light, dark }`, que "não tem cor nenhuma e engoliu a paleta
escrita abaixo dela, medindo a mesma coisa duas vezes com o nome errado"
(`src/theme/contrast.test.ts:52-56`). Só conta como paleta o bloco que tem
`paper` **e** `ink`.

- `every ink the app writes text with is legible on every ground it writes on`
  (`src/theme/contrast.test.ts:66-90`): 3 tintas × 3 fundos × todas as paletas,
  todas ≥ 4,5:1. Canário: `todas.length >= 4`.
- `the ruler is a ruler: black on white passes, gray on gray does not`
  (`src/theme/contrast.test.ts:92-98`): `contraste('#000000','#FFFFFF') > 20`,
  `contraste('#777777','#888888') < 1.5`, e simetria
  `contraste('#123456','#FEDCBA') === contraste('#FEDCBA','#123456')`.
- `the three inks stay a hierarchy, not three names for one gray`
  (`src/theme/contrast.test.ts:115-132`): `forte/medio >= 1.35` e
  `medio/fraco >= 1.35`, todos contra `paper`.

**A segunda cicatriz é do próprio conserto** (`src/theme/contrast.test.ts:100-111`):
subir `inkFaint` até a régua da WCAG empurrou-a para cima de `inkMuted` nos dois
temas claros — no Papel ficaram 5,07 e 5,34 contra o papel, "5% de diferença, que
existe na conta e não existe no olho". A guarda pedia **ordem**, e 5,34 > 5,07
passa. "Três camadas viraram duas, a tela que separa rótulo de corpo por tom
ficou plana, e quem viu foi o dono abrindo o aplicativo: *'cadê o tema papel
light'*." O 1,35× não é gosto: **os dois temas escuros, que estavam prontos,
medem 1,5× entre camadas** — eles são a referência que o claro perdeu.

#### 24.3.2 `src/theme/scheme.test.ts` — 4 testes, 47 linhas

**Regra: o padrão é claro, escolha explícita ignora o aparelho, e "sistema"
segue o aparelho de verdade.** Implementado e ativo. Técnica T1.

**Por que existe** (`src/theme/scheme.test.ts:8-11`): "a regra estava dentro do
`ThemeProvider`, onde só o navegador a alcançava — e a suíte de mutação roda a
unidade. As duas mutações que protegem esta regra sobreviveriam calmamente, com o
e2e verde dizendo que estava tudo bem." A extração de `resolveScheme` para
`src/theme/scheme.ts` foi feita para que a regra fique alcançável pelo `mutate`.

Valores exatos: `SCHEMES = ['claro', 'escuro', 'sistema']` e
`SCHEME_PADRAO = 'claro'` (`src/theme/scheme.test.ts:15`,
`src/theme/scheme.test.ts:42`).

- `the default is light, which is the owner decision`
  (`src/theme/scheme.test.ts:14-21`): `SCHEME_PADRAO === 'claro'` e
  `resolveScheme('claro', 'dark') === 'light'` — "o padrão vale mesmo com o
  aparelho no escuro — foi exatamente esse o defeito relatado".
- `an explicit choice ignores the phone, in both directions`
  (`src/theme/scheme.test.ts:23-28`): para `'light' | 'dark' | 'unspecified' |
  null | undefined`, `'claro'` sempre dá `light` e `'escuro'` sempre dá `dark`.
- `following the phone actually follows the phone`
  (`src/theme/scheme.test.ts:30-39`): `'sistema'` + `dark` → `dark`;
  `'sistema'` + `light`/`unspecified`/`null`/`undefined` → `light`. "O que o
  aparelho responde de verdade não é só claro e escuro: o `ColorSchemeName` do
  React Native também diz `unspecified`, e um navegador pode não responder nada.
  Todas essas dão claro — só `dark` escurece."
- `the three paths all exist, and none of them is dropped`
  (`src/theme/scheme.test.ts:41-47`): a lista é exatamente as três, tem tamanho
  3, e contém o padrão. A asserção de presença ao lado da de ausência está
  comentada: "sem ela, 'nenhuma escolha some' seria verdade de graça numa lista
  vazia."

---

### 24.4 O esquema do aparelho e o banco em memória

#### 24.4.1 `src/data/schema.test.ts` — 3 testes, 141 linhas

**Regra: nenhuma tabela do aparelho guarda um total de estoque.** Fundação 1.
Implementado e ativo. Técnica T2.

**A confissão que abre o arquivo** (`src/data/schema.test.ts:8-14`): "a fundação 1
diz que um saldo é a soma dos seus movimentos e que nenhuma coluna guarda um
total corrente. **O esquema do aparelho quebrou essa regra por meses enquanto
todos os testes passavam**, porque a aritmética estava certa — o defeito só era
visível perguntando de onde vinha um número, e nada pergunta isso
automaticamente." E: "consertar uma vez vale menos que tornar difícil desfazer.
Um total guardado é sempre a opção mais barata no momento em que alguém a
acrescenta: uma coluna, um UPDATE, nenhum join. Este teste é o que faz esse
momento ser barulhento."

A régua é **checagem de nome, de propósito** (`src/data/schema.test.ts:20-35`):

```
/(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)/i
```

"É deliberadamente uma checagem de nome em vez de algo mais esperto. O erro se
anuncia no nome toda vez — `on_hand`, `current_stock`, `estoque_atual` — porque
quem o escreve está descrevendo exatamente o que ele é." E estreita de propósito:
"uma guarda que dispara em qualquer coisa que contenha 'total' seria desligada
em uma semana, e uma guarda que as pessoas desligam não protege nada."

- `the guard recognises the column this project actually shipped`
  (`src/data/schema.test.ts:62-74`): reprova `on_hand_base_units` — "este é o
  nome real da coluna real que realmente existiu, em `item_costs`, até ser
  removida" —, `estoque_atual` e `current_stock`; absolve
  `quantity_base_units`, `purchase_to_base` e `total_cents`, "que é o que impede
  a guarda de ser desligada na primeira vez que grita lobo".
- `no table on the device stores a stock total` (`src/data/schema.test.ts:76-104`):
  migra um SQLite em memória, lista `sqlite_master` (excluindo `sqlite_%`),
  **exige que `movements` exista** ("o livro-razão tem de existir para qualquer
  outra coisa aqui significar algo"), e roda `PRAGMA table_info(<tabela>)` em cada
  uma.
- `a phone that dies mid-upgrade comes back on the version it finished`
  (`src/data/schema.test.ts:106-141`): envolve o `Db` real com um `execAsync` que
  **lança** quando o SQL começa com `PRAGMA user_version`, isto é, exatamente
  entre aplicar um passo e registrar que ele foi aplicado. Prova três coisas: a
  migração rejeita com `/power cut/`; `PRAGMA user_version` continua **0** ("um
  passo que não terminou não é registrado como feito"); e `sqlite_master` está
  **vazio** ("não deixou meio esquema para trás"). Depois, com a energia de
  volta, `migrate` chega até `schemaVersion`. O comentário nomeia o desastre
  evitado (`src/data/schema.test.ts:109-113`): escrito fora da transação, aquele
  vão era um jeito de **inutilizar uma instalação** — a próxima abertura
  re-executaria um `ALTER TABLE ... ADD COLUMN`, falharia por a coluna já
  existir, e falharia em toda abertura seguinte, sem jeito de entrar.

#### 24.4.2 `src/data/db.test.ts` — 4 testes, 157 linhas

**Regra: `db()` abre o arquivo uma vez, e o índice de estorno é usado.**
Implementado e ativo. Técnica T2.

**Por que existe** (`src/data/db.test.ts:7-14`): "todo outro teste desta pasta
injeta um banco pronto por `__setDb`, o que é o que torna o SQL real — e também
significa que `db()` em si, a função que abre o arquivo e o migra, era acreditada
em vez de exercitada. A primeira coisa que apareceu quando finalmente foi: dois
chamadores chegando juntos abriam duas conexões e rodavam duas migrações no mesmo
arquivo. **A capa faz cinco perguntas num `Promise.all`.**"

- `five questions at once open the file once, not five times`
  (`src/data/db.test.ts:44-64`): substitui o abridor por um que conta chamadas e
  espera 5 ms ("o driver de verdade não responde na hora, e a corrida só existe
  na janela em que ele ainda está respondendo"), faz
  `Promise.all([db(), db(), db(), db(), db()])` — "exatamente o que
  `app/index.tsx` faz no primeiro quadro" — e exige `opened === 1` e que todos os
  cinco recebam **o mesmo objeto**.
- `a launch that fails to open lets the next attempt try again`
  (`src/data/db.test.ts:66-83`): o primeiro `db()` lança `disco cheio`, o segundo
  funciona. "Uma falha lembrada para sempre transformaria uma abertura ruim num
  aplicativo que nunca mais abre até ser reinstalado."
- `the migration behind it really ran` (`src/data/db.test.ts:85-102`):
  `PRAGMA user_version > 0` e `movements` presente. "Acreditar que o esquema está
  lá é como o caminho não testado ficou não testado."
- `the reversal check seeks an index instead of scanning the ledger per row`
  (`src/data/db.test.ts:126-157`) — **o único teste do repositório que lê plano de
  consulta**. Ele executa `EXPLAIN QUERY PLAN` da cláusula `NAO_ESTORNADO`
  (`NOT EXISTS (SELECT 1 FROM movements rev WHERE rev.reverses_movement_id = m.id
  AND rev.company_id = m.company_id)`) e exige que o plano **não** contenha
  `SCAN rev` e **contenha** `movements_reversal_idx`.

  A medição que o justifica (`src/data/db.test.ts:110-124`): contra 60 mil
  movimentos (cinco meses de uma fábrica de seis lojas), janela de sete dias,
  2.779 linhas candidatas — **9.906 ms**. Sem a cláusula, 3 ms. Com o índice
  parcial da V17, 4 ms. "Oito consultas do aplicativo usam a cláusula e a capa
  dispara cinco de uma vez — numa conexão só, que serializa." E a escolha
  metodológica: "este teste não mede tempo: tempo varia com a máquina e viraria
  teste instável. Ele lê o plano de execução, que é a causa." Por que passou dois
  meses invisível: "a barra inteira exercita 96 movimentos, e com 96 linhas uma
  varredura por linha é instantânea."

#### 24.4.3 `src/data/outbox.test.ts` — 2 testes, 71 linhas

**Regra: `QUEUED_TABLES` é conferida contra o código e contra o esquema, nunca
contra si mesma.** Implementado e ativo. Técnica T3 + T4.

As duas formas de errar, nenhuma visível em tempo de compilação
(`src/data/outbox.test.ts:11-20`): tabela enfileirada fora da lista → "a órfã
dela sobrevive, e o motor volta a parar na primeira que aparecer"; tabela na
lista que não existe no esquema → "o `SELECT ... FROM <tabela>` levanta erro de
SQLite dentro da transação de apagar, e apagar deixa de funcionar".

- `every table the code queues is a table the orphan sweep knows`
  (`src/data/outbox.test.ts:34-54`): extrai `table: '([a-z_]+)'` de
  `src/data/repository.ts` (canário: `> 10`) e exige que cada uma esteja em
  `QUEUED_TABLES` **ou** seja `'erase'` — "comando, não linha: `erase` não tem
  linha atrás dele, e é exatamente o que a varredura não pode confundir com
  órfã".
- `every table the sweep visits exists, with the id column it asks for`
  (`src/data/outbox.test.ts:56-70`): cada `QUEUED_TABLES` tem um
  `CREATE TABLE IF NOT EXISTS` em `src/data/db.ts` (canário: `criadas.size > 15`)
  e o corpo do `CREATE` casa `/^\s*id\s/m`, porque a varredura compara
  `t.id = o.row_id`.

A lição está escrita (`src/data/outbox.test.ts:21-24`): "as duas são pegas lendo o
sistema — o `repository.ts` e o `db.ts` — em vez de comparar esta lista com ela
mesma. Foi a cicatriz do `erase.test.ts`: um mapa escrito à mão conferido contra
o union que tinha os mesmos membros, e nove tabelas invisíveis por construção."

#### 24.4.4 `src/data/erase.test.ts` — 10 testes, 307 linhas

**Regra: apagar não tem desfazer, então a ordem e a recusa são presas mais forte
que o resto.** Implementado e ativo. Técnica T3 (lê `db.ts`) + T1 (a lógica de
bloqueio).

**A cicatriz é da própria guarda, e é a mais instrutiva do repositório**
(`src/data/erase.test.ts:24-42`): o teste de cobertura era um `Record` escrito à
mão com doze entradas, e percorria as chaves **desse mapa** perguntando se cada
uma estava em `tablesFor('all')`. Como o mapa tinha exatamente os membros do
union `ErasableTable`, a asserção era *"todo membro do conjunto fechado está na
lista do conjunto fechado"* — **a lista conferida contra si mesma**. "Uma tabela
que não estivesse no union era invisível para o teste, por construção."

O custo real: **nove tabelas do aparelho nunca eram apagadas, e cinco delas
apontam para `items` ou `locations` com RESTRICT.** Depois da primeira corrida de
produção, "Apagar tudo" levantava `FOREIGN KEY constraint failed` e **não apagava
nada** — com o teste verde todo o tempo, "porque o autor do mapa e o autor da
lista eram a mesma pessoa lembrando das mesmas doze tabelas".

O conserto: o esquema é **lido** de `db.ts`, nunca copiado
(`src/data/erase.test.ts:43-48`). E as arestas de chave estrangeira também
(`src/data/erase.test.ts:58-77`): casa
`CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\)` e dentro do corpo
`REFERENCES (\w+)\(\w+\)\s+ON DELETE RESTRICT`, **mais** as colunas acrescentadas
por `ALTER TABLE (\w+) ADD COLUMN \w+ TEXT REFERENCES (\w+)\(\w+\) ON DELETE
RESTRICT` — "são justamente as da grade do produto, que apontam para
`product_lines`, `product_types` e `flavors` com RESTRICT". Auto-referência é
filtrada (`pai !== tabela`).

A única renúncia registrada, `FICA_DE_PROPOSITO` (`src/data/erase.test.ts:87-90`):
`app_meta` — "a gaveta local do aparelho: a cara escolhida, a luz da tela, a
cidade do tempo, o que a capa esconde. Não é dado do negócio, e apagá-la faria o
aplicativo reabrir estranho para quem só queria limpar o exemplo."

Os dez testes:

| teste | linha | o que prende |
|---|---|---|
| `erasing everything reaches every table the device actually creates` | 92-110 | toda tabela criada em `db.ts` está em `tablesFor('all')` ou em `FICA_DE_PROPOSITO`. Canário: `NO_APARELHO.length > 15` |
| `the deliberate leftovers list only holds tables that still exist` | 112-117 | renúncia órfã reprova; motivo > 40 caracteres |
| `every area deletes children before the rows they point at` | 119-138 | para as áreas `purchases, recipes, products, inputs, all`, nenhuma tabela é apagada depois de um pai RESTRICT dela. Canário: `DEPENDE_DE.size > 15` |
| `erasing everything takes everything that RESTRICT-points at items` | 161-189 | todo filho RESTRICT de `items` está em `tablesFor('all')`. Canário: `filhosDeItem.length > 3` |
| `the two areas that own items never claim the same kinds` | 191-200 | `itemKindsFor('inputs')` e `itemKindsFor('products')` são disjuntos; `itemKindsFor('purchases') === null` |
| `a recipe standing on an input blocks the input, and names the count` | 202-211 | `blockerFor('inputs', …)` = `{ reason: 'recipesUseInputs', count: 2 }`, e `blockerFor('recipes', …) === null` — "a saída é real" |
| `a purchase blocks the input it bought, once no recipe is in the way` | 213-223 | `{ reason: 'purchasesUseInputs', count: 1 }` |
| `a product made from a recipe blocks the recipe` | 225-229 | `{ reason: 'productsUseRecipes', count: 1 }` |
| `erasing everything is never blocked - that is the point of it` | 231-246 | `blockerFor('all', <tudo emaranhado>) === null` |
| `the confirmation is told exactly what disappears, so it can count it` | 248-307 | `tallyFor` por área |

**Por que só o "tudo" é cobrado da regra de RESTRICT** (`src/data/erase.test.ts:142-152`):
`blockerFor` devolve `null` para `all` (`erase.ts:176`), então "nada recusa esse
caminho antes do toque, e tudo o que travaria o `DELETE FROM items` TEM que estar
na lista — não há segunda rede". As áreas menores têm a rede: `inputs` é recusada
por `recipeLinesUsingInputs` e `purchaseLinesUsingItems`, e `products` por
`purchaseLinesUsingProducts`. "Cobrar delas a mesma regra do `all` acusaria um
defeito que não existe, e alarme inventado ensina a ignorar alarme." A premissa
fica presa dentro do teste (`src/data/erase.test.ts:166-179`): `blockerFor('all',
…)` com **todas** as contagens em 9 continua `null` — "com `emptyCounts` esta
linha seria verdade de graça".

**A lacuna, escrita em vez de omitida** (`src/data/erase.test.ts:154-159`): "uma
linha de receita que aponte para um item de tipo PRODUTO — um picolé usado dentro
de outro produto. `recipe_lines.item_id` é RESTRICT, e
`purchaseLinesUsingProducts` não conta esse caso. É estreito e nunca aconteceu, e
a checagem honesta dele é executável (montar o banco e rodar a área), não
estática. Fica escrito aqui para não ser descoberto por um erro de SQLite na tela
de alguém." **NÃO COBERTO.**

**A cicatriz de fixação com zero** (`src/data/erase.test.ts:249-255`): o campo
`movements` entrou na fixação como `movements: 0` quando nasceu, "e zero faz a
asserção passar com ou sem o campo sendo carregado — a mutação que tirava
`movements` de `tallyFor('purchases')` atravessou a suíte por causa desta linha".
Hoje é `movements: 412`. As contagens exatas afirmadas
(`src/data/erase.test.ts:266-306`):

- `tallyFor('all', …)` = `{ inputs: 6, movements: 412, recipes: 2, products: 1, purchases: 6, places: 3 }`
- `tallyFor('purchases', …)` = `{ inputs: 0, movements: 412, recipes: 0, products: 0, purchases: 6, places: 0 }`
- `tallyFor('inputs', …)` = `{ inputs: 6, movements: 412, recipes: 0, products: 0, purchases: 0, places: 0 }`
- `tallyFor('recipes', …).movements === 0` e `tallyFor('products', …).movements === 0`
- `isEmpty(tallyFor('all', emptyCounts)) === true`; `isEmpty(tallyFor('all', counts)) === false`

A razão do 412 aparecer em três áreas e não nas outras duas está escrita: "as três
áreas que apagam `movements` levam o livro-razão inteiro da empresa junto, não só
os movimentos daquela área. A confirmação tem que dizer o número" — e "apagar
receita ou produto não apaga movimento nenhum, e anunciar 412 movimentos ali
seria assustar quem não precisa."

Uma decisão de produto fica afirmada de passagem (`src/data/erase.test.ts:284-287`):
"uma loja não é insumo, receita, produto nem nota, então nenhuma área menor pode
levá-la — só 'apagar tudo' pode."

#### 24.4.5 `src/data/simulate.test.ts` — 3 testes, 122 linhas

**Regra: a quinzena simulada é fato, escrita pela porta da frente, e determinística.**
Implementado e chamado por tela (`app/settings.tsx` semeia duas semanas). Técnica T2.

**Por que existe** (`src/data/simulate.test.ts:10-18`): "metade do briefing só tem
o que dizer quando há passado: 'saíram 480 hoje, 200 a mais que na segunda
passada' não se testa contra um banco cuja história inteira é esta manhã. O ramo
da comparação estava sem nenhum teste por essa razão exata."

**O instante é fixo, e isso é cicatriz da proofgate** (`src/data/simulate.test.ts:22-29`):
`AGORA = '2026-09-01T15:00:00.000Z'`. "Teste que lê a hora de verdade roda
diferente às 23h59 e à 00h01, e a promessa de determinismo desta simulação não
valia enquanto 'hoje' fosse o dia em que a suíte por acaso rodou." Fuso:
`America/Sao_Paulo`.

- `a fortnight of operation lands in the ledger, spread over its days`
  (`src/data/simulate.test.ts:63-83`): `runs >= 8`, `deliveries >= 5`,
  `invoices >= 1`; e **hoje e a semana passada** têm produção, "que é o par exato
  de que a home precisa para dizer algo em vez de 'primeira produção'".
- `the same seed writes the same fortnight, twice`
  (`src/data/simulate.test.ts:85-96`): `simulateFortnight(…, { seed: 7 })` duas
  vezes num banco limpo dá `deepEqual`. "Determinismo não é preciosismo: um teste
  que falha tem de falhar de novo igual, e o dono olhando a tela e a suíte
  olhando a asserção têm de estar vendo a mesma fábrica."
- `the simulation writes through the front door, so the balance survives it`
  (`src/data/simulate.test.ts:98-122`): nenhum item fica com
  `onHandBaseUnits < 0`, "porque a simulação chama `recordProduction`, que hoje
  recusa consumir o que não tem. Se ela escrevesse SQL próprio, isto passaria e a
  fábrica simulada seria impossível"; e há remessa nos dois últimos dias.

---

### 24.5 `src/data/repository.test.ts` — 74 testes, 3.388 linhas

O arquivo mais importante da suíte. Técnica T2 pura: **as consultas de verdade,
contra o esquema de verdade, migrado pelo migrador de verdade.**

**Por que ele existe** (`src/data/repository.test.ts:73-85`): "todo o resto desta
suíte testa aritmética, que é onde os bugs importantes estiveram. Mas aritmética
que está certa e é então guardada errado é indistinguível de aritmética errada, e
o SQL não tinha teste nenhum: `expo-sqlite` só existe num aparelho. O Node traz o
próprio SQLite, e `db()` já estava escrito contra uma interface nomeada, então as
consultas reais podem rodar aqui — as mesmas instruções que o celular executa,
contra o mesmo esquema, incluindo as chaves estrangeiras que decidem o que apagar
tem permissão de fazer."

**Preparo.** `beforeEach` (`src/data/repository.test.ts:120-128`) cria um SQLite em
memória, roda `migrate(conn)` — "o mesmo corredor que o celular usa ao abrir,
então os testes exercitam o caminho da migração em vez de um esquema escrito uma
segunda vez" — injeta por `__setDb`, e guarda a conexão em `live` "para um teste
poder perguntar ao esquema sobre si mesmo, não só aos dados".

Dois auxiliares: `anInput(name, perPack)` cria um insumo com `purchaseUnit:
'saco'`, `baseUnit: 'g'` e hierarquia solta `{ tiers: [{ id: 'unit',
perBaseUnit: 1 }] }` (`src/data/repository.test.ts:131-141`); e `custoDe(itemId)`
lê `average_rate` de `item_costs` — o cache que a recomposição escreve
(`src/data/repository.test.ts:145-153`).

#### Estorno e correção (a Fundação 1 em uso)

| teste | linha | regra presa |
|---|---|---|
| `an invoice typed wrong can be undone, and takes the average back with it` | 165 | a compra grava `movement_group_id`; o grupo é a **nota**, não a linha (`nota.groupId !== nota.id`); `reverseGroup` devolve quantidade **e** custo médio; a linha passa a dizer `reversed: true`; o segundo estorno lança `CannotReverseError` |
| `a count and a loss can each be undone, and the balance comes back` | 223 | contagem e perda são atos de **uma perna**, e o grupo delas é a própria linha (`contagem.groupId === contagem.id`); perda desfeita **desaparece do relatório** `lossesOn` — "o que foi estornado não aconteceu" |
| `reversing a run puts back every leg of it, and leaves both records standing` | 3041 | `planReversal` devolve `legs` com a perna do produto **negativa** (−500) e as dos insumos positivas; `blocked` vazio; o lote **não some**; e `productionOn` deixa de contar a corrida estornada |
| `a run whose product already shipped cannot be reversed, and the refusal names what left` | 3115 | `plano.blocked = [{ name, held: 100, needed: 500 }]`; `CannotReverseError` carrega o plano "porque a tela precisa dizer QUAL item já saiu"; nada é escrito pela metade |
| `reversing twice would double the correction, so the second time is refused` | 3161 | `alreadyReversed: true`; o saldo não se move no segundo |
| `reversing a run gives the money back, not only the quantity` | 3248 | a média volta ao valor de antes da corrida errada; `item_cost_history` ganha ≥ 3 linhas; o lote da corrida boa não some |

Três docblocks dão o raciocínio inteiro:

- A compra, a contagem e a perda — **três dos sete caminhos de escrita não
  gravavam grupo nenhum** (`src/data/repository.test.ts:156-164`). "Sem grupo,
  `planReversal` não acha o ato, e o que não é achado não é desfeito — a nota com
  dez sacos onde era um ficava no razão para sempre, com a média envenenada
  embaixo de todo número de dinheiro do aplicativo."
- O estorno "é a primeira fundação do projeto e não tinha escritor", e as três
  coisas que ele precisa fazer correspondem a três jeitos de corromper o
  livro-razão: "desfazer o ATO inteiro e não uma linha, recusar o que deixaria
  saldo negativo, e não desfazer duas vezes" (`src/data/repository.test.ts:3034-3040`).
- Estornar devolve **dinheiro**, não só quantidade
  (`src/data/repository.test.ts:3236-3247`): "o saldo voltava certinho e o custo
  médio ficava com o erro dentro para sempre. A confirmação que a pessoa lê diz
  *'os dois lançamentos ficam no histórico — nada é apagado'*, e ela entende que o
  erro foi desfeito. **Metade dele era.** Média móvel não se desfaz por aritmética
  inversa: ela depende do caminho. O que se faz é replicar o caminho — e é isso
  que `recomputeItemCost` faz."

E uma cicatriz de teste dentro do primeiro deles
(`src/data/repository.test.ts:3086-3094`): "o saldo é soma pura e se conserta
sozinho. Mas as consultas de 'o que aconteceu' filtram por `kind`, e `reversal`
não é `production`: sem o `NAO_ESTORNADO` na cláusula, o almoxarifado fica certo e
a capa continua dizendo que a fábrica produziu 500 picolés que foram desfeitos. A
mutação que tira esse filtro atravessou a suíte inteira, e só apareceu quando a
oficina do `mutate` voltou a rodar de verdade."

#### Compra, custo médio e precisão de taxa

| teste | linha | regra presa |
|---|---|---|
| `a purchase writes the invoice and moves the average in one step` | 270 | primeira nota tem `previousRate: null`; 4 sacos por R$ 472 em 100.000 g dão **0,472** centavo/g; a segunda a R$ 590 leva a média a **0,531** — "o mesmo número contra o qual o gatilho do Postgres é conferido"; `lastRate` = 0,59 continua visível; `recentCostChanges` tem **1** linha, "só o movimento que tinha de onde se mover" |
| `the rate survives storage at full precision, not rounded to a cent` | 305 | `itemCosts` devolve `rate(12.4, 1_000)` = 1,24 centavo/g. "Guardado como inteiro, este é o bug que uma vez custou ao motor 19% da polpa e toda a mistura" |
| `erasing invoices drops the average with them` | 514 | sem nota, `itemCosts` = `{}` **e** todo saldo vai a zero. A razão está presa porque a regra parece larga demais: "uma contagem é guardada como diferença contra um saldo — apague as chegadas contra as quais ela foi medida e o que resta é aritmética sobre nada" |
| `what the buyer typed becomes base units through one rule, not two` | 749 | `purchaseToBaseUnits({purchaseToBase: 25_000}, 4) = 100_000`; `0.5` → `12_500` ("meio saco acontece, e a unidade-base é a menor coisa que existe, então cai num inteiro"); `purchaseToBase: null` → a unidade de compra **é** a unidade-base, `7` → `7` |
| `a manufactured product is worth what it cost to make, everywhere it is` | 3193 | a média do produto **é** a taxa congelada da corrida; e mandar 500 para a loja põe `valueCents = round(unitCostRate * 500)` lá. "Antes disto, mandar 500 picolés para a loja fazia o dinheiro evaporar: o insumo saía valorado do almoxarifado e o produto entrava valendo zero na loja" |

`purchaseToBaseUnits` tinha "um chamador, afinal — era só uma segunda cópia de si
mesma, digitada à mão dentro da tela de compra. Duas implementações de uma regra
concordam até alguém corrigir uma delas, e então não há como dizer qual número
está certo" (`src/data/repository.test.ts:739-742`).

#### O livro-razão: soma, contagem, piso, unidade inteira

| teste | linha | regra presa |
|---|---|---|
| `the stock figure is the sum of movements, and the tempting column is gone` | 580 | a chegada é uma **linha** de `movements`, não um total; e `PRAGMA table_info(item_costs)` **não** tem `on_hand_base_units`. "Se esta coluna voltar, o bug volta com ela" |
| `a count can take stock down - which nothing in this app could do before` | 607 | 92 kg onde o razão esperava 100: `expected 100_000`, `counted 92_000`, `delta −8_000`, **`deltaCents −3_776`** (8000 × 0,472). O tipo gravado é `adjustment` — "a palavra que o próprio livro-razão tem para uma correção de contagem física, então a contagem não precisa de coluna nenhuma para dizer o que era" |
| `a count that finds exactly what was expected is still written down` | 638 | diferença 0 **grava** uma linha `adjustment` de 0. "Uma prateleira que ninguém olhou em meses não pode ler igual a uma que alguém verificou hoje de manhã" |
| `counting a shelf compares against that shelf, not the whole company` | 852 | contar a câmara fria acha os 4 kg que estão lá, e o almoxarifado fica intocado. "Antes do filtro por local, o esperado era o saldo inteiro da empresa: estoque teleportado entre salas por alguém que fez o trabalho certo" |
| `the shelf a screen shows is the shelf a count is compared against` | 1266 | três perguntas, três respostas: `findItem(co, id)` = **50.000**, `findItem(co, id, fabrica)` = **44.000**, `findItem(co, id, camara)` = **6.000**; contar a câmara com 6.000 dá `expected 6.000` e `delta 0`; e `itemMovements` com sala mostra o `adjustment` só na câmara — "a câmara conferida não faz a fábrica parecer conferida" |
| `what the ledger stores is whole base units, because the column is an integer` | 1976 | toda linha do grupo tem `Number.isInteger(quantity_base_units)`. O caso concreto: "uma sub-receita divide — um tacho deste produto pede meio tacho de base de creme, e meio tacho são 7530,612244897959 g de açúcar. A afinidade de tipo do SQLite leva esse REAL para uma coluna INTEGER sem uma palavra, o Postgres arredondaria, e os dois lados do mesmo movimento param de concordar. As telas mostravam: 34.938,776 g numa e 34.939 g na seguinte, para um saco" |
| `a kettle is refused when the sugar is in the store, not in the factory` | 1834 | com tudo transferido para a loja, `recordProduction` na fábrica lança `NotEnoughStockError`, e a falta é dita **por nome** e não por uuid; nada é escrito |
| `nobody loses what they do not have` | 1041 | perda maior que o saldo lança `NotEnoughStockError` **antes** da escrita; perda de zero é recusada |
| `a loss leaves the ledger, carrying the reason that makes it useful` | 1010 | `quantity_base_units = −4000` ("o sinal é da função, não de quem chama") e `loss_reason = 'expired'`. "É o que separa 'sumiram quatro quilos' de 'quatro quilos venceram', e só a segunda muda uma decisão" |

#### Produção: corrida aberta, lote, custo congelado, meio tacho

| teste | linha | regra presa |
|---|---|---|
| `a production run writes one line per item, and freezes what each cost` | 2011 | uma linha `production` e uma `consumption` por ingrediente, "nunca uma linha só carregando uma carga, porque então o saldo deixa de ser uma soma"; `unitCostRate = valor consumido / unidades + unitPackagingCents`; a linha de produção carrega a mesma taxa; e o estoque desceu por exatamente o que foi usado |
| `a run that yielded less freezes the higher cost, because that is what happened` | 2063 | 400 unidades do mesmo tacho custam mais que 500; e a razão é tomada **só sobre a massa**: `(short − pack)/(full − pack) === 500/400`, porque "um palito é um palito: custa o mesmo se o tacho rendeu 400 ou 500" |
| `an open run is state: the ledger does not know it until it closes` | 1128 | abrir não escreve nenhuma linha; fechar escreve ≥ 3 no grupo cujo id é o da corrida |
| `a cancelled run leaves nothing to reverse` | 1157 | cancelar não precisa de estorno "porque nunca houve lançamento"; cancelar duas vezes não é erro |
| `two taps on close do not produce twice` | 1175 | o segundo `closeProductionRun` lança `RunGoneError` **antes** de escrever |
| `a run that cannot close stays open, instead of being lost` | 1191 | `NotEnoughStockError` ao fechar deixa a corrida **aberta**. "A pessoa lança a compra que chegou e fecha depois. Perder o registro do tacho que rodou seria o pior dos dois mundos" |
| `the lot says which sheet ran, and correcting the sheet later does not rewrite it` | 1064 | o lote carimba `recipeVersion: 1`; salvar a versão 2 **não** muda o lote de ontem; e `openProductionRun` grava a **versão** em `recipe_version_id`, conferido pelo que foi **lido de volta** de `openProductionRuns` e não pelo objeto de retorno |
| `half a kettle takes half the ingredients…` | 2278 | `batches: 0.5` consome metade (tolerância de 1 unidade-base por linha, por arredondamento); e o almoxarifado sente os dois |
| `listed packaging leaves the storeroom, per unit, and lands in the frozen cost` | 2487 | 100 unidades gastam **100 palitos** (por unidade, não por tacho); `packagingItems` relidos trazem o **nome do catálogo**; e a taxa congelada é `massa/100 + taxaPalito + taxaSaquinho`, pelas taxas das notas e não por valor digitado |
| `a run without packaging in stock is refused before anything is written` | 2567 | sem palito, `NotEnoughStockError`. "A trava é a mesma dos insumos, e é por isso que a embalagem entra em `needed` em vez de num caminho paralelo: sem palito, a fábrica não roda" |
| `a run becomes a lot, and the lot carries the day it dies` | 1438 | `20260902-01`, `20260902-02` no mesmo dia, `20260903-01` no seguinte; `expiresOn: '2027-03-01'` com 180 dias; **só a linha de produção aponta para o lote** ("carimbar o lote do picolé na saída da polpa faria o recall recolher o saco de açúcar"); e o lote sobe na fila **antes** do movimento que o cita |
| `a product with no shelf life still gets a lot, without a date` | 1592 | `expiresOn: null` gravado como `null`. "Uma data inventada seria pior nos dois sentidos — descartar o que está bom, ou vender o que já passou" |
| `the day's lots are listed by code, with what each one yielded` | 1527 | nada produzido dá lista **vazia**, não linha zerada; a quantidade vem do **movimento** ("o lote é a identidade, e quem sabe quanto saiu é o livro-razão"); lote de outro dia não entra na janela |
| `a lot opens by its own id, and a lot that is gone says so` | 1566 | `findLot` traz código, nome, 480 unidades e `producedOn`; id inexistente → `null`; **lote de outra empresa → `null`** |
| `the short history is runs, not days, and expiry only warns about what is still there` | 2374 | `recentRuns` dá **uma linha por corrida** (120, 100, 80 — mais recente primeiro), com código de lote e taxa congelada; o limite corta pelo fim; `expiringSoon` vazio é resposta; e o lote que saiu para a loja deixa de avisar **na fábrica** e passa a avisar **na loja** |
| `a lot warns about expiry from wherever it is, not only from the storeroom` | 3317 | depois de ir para a câmara com `lotId` nomeado, `expiringSoon` sem sala **continua** avisando; e com a fábrica como filtro, não |

O carimbo de versão tem a razão inteira escrita (`src/data/repository.test.ts:1113-1121`):
a mutação trocava o parâmetro do `INSERT` por `product.recipeId` e o objeto de
retorno continuava certo — "um uuid legítimo na coluna errada, invisível até o dia
em que alguém perguntasse qual ficha rodou". É por isso que a asserção final lê a
linha gravada, não o retorno.

#### Lugares, transferência, devolução, conferência

| teste | linha | regra presa |
|---|---|---|
| `the balance splits by place, and the company total does not move` | 897 | `balanceByLocation` dá 6.000 na câmara com `kind: 'cold_room'`; o total da empresa não muda; **e os lugares somam a empresa** — "é isso que faz das duas consultas uma aritmética" |
| `what leaves the factory arrives at the store, and the company has the same` | 2091 | as duas pernas exatas: `[−5000, factory, store]` e `[5000, store, factory]`. "Cada perna diz para onde foi a outra metade. Isso é explicação, não aritmética — 'quanto tem aqui' continua sendo uma soma simples sem caso especial" |
| `a transfer to the same place, or of nothing, is refused rather than recorded` | 2135 | recusa com `/mesmo lugar/` e `/move alguma coisa/`. "As duas acrescentariam linhas a um livro-razão que não pode ser editado depois, e nenhuma descreve algo que aconteceu" |
| `renaming a place moves no money, because no movement carries its name` | 2156 | depois do `savePlace` com novo nome, `valueCents` e as linhas são idênticas |
| `the places add up to the company, in quantity and in money` | 2183 | para todo item com saldo, a soma dos lugares é o saldo da empresa. "Duas telas, uma aritmética. No momento em que param de concordar, uma das duas está mentindo" |
| `a place that was emptied is absent, not zero` | 2215 | ida e volta deixa **4** movimentos no razão e o lugar **ausente** de `stockByPlace`. "Uma tela que imprimisse '0 g' estaria convidando alguém a ir conferir uma prateleira que não tem açúcar" |
| `the storeroom answers for one room when asked, and for the company when not` | 1621 | `listItems(co)` = total; `listItems(co, undefined, false, sala)` = daquela sala; e as duas salas somam o total. "Com a polpa dividida, o almoxarifado dizia 34 kg enquanto quem estava no tacho tinha 20 na mão. O número não estava errado — estava respondendo outra pergunta" |
| `what went out is grouped by where it landed, in the units each item has` | 941 | **dois** destinos e a fábrica não é um deles ("a origem não é destino" — ler as duas pernas dobraria o total do dia); a linha traz `baseUnit: 'g'` — "seis mil GRAMAS, e não seis mil açúcares" |
| `a store that checked and a store that did not are different facts` | 1207 | `recordCheck` sem lista dá `differences: [{ itemId, baseUnits: 0 }]` — a linha que o servidor recusava antes da migração 0017, "e que é a prova de que alguém abriu a caixa"; `unchecked` passa a listar só a outra loja; o total da empresa não muda |
| `what is missing at the door leaves the store balance short, by exactly what was missing` | 1317 | 6.000 saíram, 5.500 chegaram: `differences: [−500]`, a loja fica com 5.500 e a empresa perde os 500. "Nada foi apagado: a remessa continua dizendo que 6.000 saíram" |
| `a return is a return, not a transfer running backwards` | 1787 | duas pernas de `kind = 'return'` e duas de `transfer`. "Sem tipo próprio, 'mandei 6.000 e voltaram 1.000' e 'mandei 5.000' ficariam idênticos no livro-razão — e a diferença entre os dois é a única coisa que interessa a quem quer saber se aquele sabor vende naquela loja" |
| `a return on the same day does not quietly shrink what the store received` | 1348 | `shipmentsOn` mostra **6.000** para a loja e **1.000** para a fábrica. "São dois fatos, não um saldo" |
| `the guess for the next load reads what arrived, not what left` | 2242 | sem histórico, `null` ("um campo pré-enchido com zero seria mentira vestida de ajuda"); com dois envios, **4.000** — o mais recente e **positivo**, porque ler a perna que sai daria negativo "que o botão então recusa em silêncio"; e é por lugar |
| `the room says what was inside it AT THE READING, not what is inside now` | 1662 | `lotsInRoomAt(co, camara, '07:20')` = **2 lotes**; às 15:00 = **1**; e a resposta das 07:20 não muda depois. "Sem o corte no tempo, o recall perderia justamente o lote que já viajou — que é o que mais importa achar" |
| `the agreement sheet is kept, corrected and queued for the server` | 2701 | `deliveryDays: 4|32` → **36**; renomear **não** apaga telefone nem acordo; `deliveryDays: 200` é recusado com `/semana/` antes de virar linha na fila; e o serializador leva `contact_phone`, `delivery_days` e `agreement_note` |

#### Janela de tempo e o dia da fábrica

| teste | linha | regra presa |
|---|---|---|
| `the day a run belongs to is when it happened, not when the phone told the server` | 1392 | corrida às 23h50 de segunda sincronizada na terça conta na **segunda**. "Se a consulta filtrasse por `recorded_at` — que é agora, para as duas — segunda teria zero e terça teria 900" |
| `a run exactly at midnight is counted once, not twice` | 1944 | janela meio-aberta `[from, to)`: o movimento à meia-noite aparece **só** em hoje. "Com as duas pontas fechadas, apareceria nos dois dias, e quem comparasse hoje com ontem veria um número que ninguém produziu" |
| `the week the home screen draws carries the runs, and only the runs` | 1889 | `productionBetween` traz `[400, 500]` e **nada além**. "Se a régua de sete dias somasse o movimento inteiro em vez de filtrar por `kind = 'production'`, a coluna do dia mostraria a produção menos os insumos que ela comeu: um número que não é nem uma coisa nem outra, e que fica NEGATIVO em qualquer receita que pese mais que rende" |
| `what is running out comes from what actually left, and a still input never alarms` | 2319 | janela sem saída → lista **vazia** ("um alerta inventado aqui ensina a fábrica a ignorar o alerta de verdade"); ordenado pelo mais apertado; e `daysLeft === onHandBaseUnits / dailyOutflow` "para a tela poder abrir essa conta" |
| `what is running out answers for the room you are looking at, and for the kind` | 2752 | o açúcar parado na loja **não** tem data de acabar na loja; a fábrica continua respondendo com saldo menor; e pedir `['packaging']` devolve só palito, pedir `['input']` não devolve palito |

#### Receita, produto, semente, apagar, fila

| teste | linha | regra presa |
|---|---|---|
| `saving a recipe twice keeps both versions and reads back the newest` | 320 | `version: 1` e depois `2` — "uma mudança é uma versão nova, nunca uma sobrescrita"; `loadRecipeGraph` traz a 2; `listRecipes` continua com **1** receita |
| `a sub-recipe survives the round trip through the database` | 352 | carregado do SQLite e custeado pelo mesmo motor das telas, a sub-receita aparece como linha própria e carrega o custo para cima |
| `a recipe carries the identity of the version it is, not just its number` | 822 | `versionId` existe e é **diferente** de `recipe.id`, e a linha `recipe_versions` com aquele id tem o `recipe_id` e o `version` certos. O bug substituído: "a consulta selecionava `recipe_versions.id` e depois mapeava `id: v.recipe_id`, então a identidade da versão nunca saía da camada de dados. Tudo continuava compilando, todo teste continuava passando, e registrar qual fórmula uma produção usou era silenciosamente impossível — o único item que a auditoria de fase pôde marcar 'ausente' sem um motivo" |
| `a product is an item too, and saving one creates both` | 541 | `productId` e `itemId`; `unitPackagingCents = 5`; a hierarquia volta como JSON com 2 camadas; e o produto **não** aparece em `listItems(co, 'input')` |
| `the starter data lands, and does not come back after it is wiped` | 390 | o exemplo é 6 insumos, 2 receitas, 1 produto, 6 compras; depois de `eraseArea('all')`, `ensureStarterData` **não** o traz de volta; e `hasSeeded()` continua `true` enquanto `exampleStillHere()` passa a `false` — "a marca é o que impede o exemplo de voltar, e ela não é a presença do exemplo". A tela de Ajustes "contava uma variável e nomeava outra" |
| `erasing an area is refused when another area stands on it` | 423 | `EraseBlockedError` com `reason: 'recipesUseInputs'` e `'productsUseRecipes'`; e seguir a ordem que a recusa nomeou funciona até o fim. "A recusa carrega o motivo, não uma frase — a tela escreve a frase, que é o que deixa a mesma regra falar três idiomas" |
| `erasing one area leaves the others standing` | 504 | apagar produtos deixa 2 receitas e 6 insumos |
| `erasing an area forgets what the queue was going to send about it` | 468 | depois de `eraseArea('purchases')`, zero entradas de `movements`, `purchases` e `purchase_lines` na fila; os `items` **continuam inteiros**; e o comando `erase` com `rowId: 'purchases'` está na fila. "A órfã não é recusa do servidor: o serializador levanta *'Queued movements X but the row is gone from the device'*, e o motor para a fila no primeiro buraco de propósito — então tudo o que a fábrica gravar depois fica preso atrás dela" |
| `erasing everything leaves the order to erase, and nothing else` | 718 | a fila fica com exatamente `['erase']`, `op: 'delete'`, `rowId: 'all'`. "O comando que descreve a limpeza se apagava de passagem: o aparelho saía vazio, o servidor nunca ouvia, e a sincronização seguinte restaurava exatamente o que a pessoa tinha pedido para destruir" |
| `the outbox forgets what went up, and only what went up` | 763 | `forgetSentBefore('2099-01-01')` remove tudo que foi aceito e **nada** do que espera. "Uma escrita descartada antes de chegar é uma escrita que a pessoa viu a si mesma fazer e a fábrica nunca vai ver" |
| `a phone that already holds invoices keeps its balance through the upgrade` | 658 | levanta o banco na versão 2 (antes de existir livro-razão), insere item/compra/linha/`item_costs` com `on_hand_base_units`, roda `migrate`, e a soma de `movements` dá 100.000; a linha mantém o **id `l1`** ("para uma reexecução não poder duplicá-la"), `kind = 'purchase'` e `unit_cost_rate = 0.472`; e rodar `migrate` de novo é no-op |
| `a movement made by talking carries the sentence; one made by hand does not` | 786 | `assistant_phrase` preenchida na compra falada e **`null`** na digitada. "A condição que o plano pôs para deixar um assistente escrever: as escritas dele continuam auditáveis. A coluna, o índice dela e a travessia para o servidor estavam todos no lugar e nada nunca a preenchia" |

#### Pedidos: demanda não é movimento

| teste | linha | regra presa |
|---|---|---|
| `an order is demand, and demand moves nothing` | 2853 | `saveOrder` não cria **nenhuma** linha em `movements`; `status: 'open'` sem aprovação ligada; a fila recebe `orders` **e** `order_lines` |
| `what can be promised counts every room of ours, and no store` | 2901 | 200 produzidos, 150 para a câmara, 30 para a loja: `stockAgainstOrders` dá **170**. "A câmara é nossa e conta; a loja já foi entregue e não conta" |
| `what was ordered is measured against the factory shelf, not the company total` | 2937 | `requested: 300`, `onHand: 50` — "o que já está numa loja não atende o cliente que pediu na fábrica"; pedido de outubro não entra na janela de 10/09; entregue vira `requested: 0` **e a linha continua existindo** |
| `approval is the company's choice, and it decides where an order is born` | 3003 | `ordersNeedApproval()` é `false` por padrão; ligado, o pedido nasce `pending`; **e pendente já conta como compromisso** — "quem espera aprovação para começar a produzir descobre na sexta que devia ter começado na quarta" |
| `the picking list says what the store ordered and what the room has` | 1739 | `ordered: 420` (dois pedidos somados), `available: 400` (**da sala** de onde a carga sai), `dueOn: '2026-09-04'` (o mais urgente), **`orders: 2`** — "ela dizia 'pedido para 04/09: 420 un' — singular, com a data do primeiro e a quantidade dos dois. Somar e rotular no singular é a única combinação que mente"; pedido de outra loja não entra; janela curta não traz nada |

A regra que o bloco existe para segurar está dita numa frase
(`src/data/repository.test.ts:2847-2852`): "pedido não é movimento. Se um dia
alguém 'otimizar' isso gravando a demanda no livro-razão, o saldo passa a mentir
no instante em que um cliente liga, e nenhum outro teste deste arquivo acusa."

A correção sobre o plural de salas (`src/data/repository.test.ts:2890-2900`): "a
decisão escrita continua valendo e não é o que estava errado: o saldo lido é o de
onde a CARGA SAI, não o da empresa. O defeito era o plural: a conta lia um lugar
só, o `defaultLocationId`. Numa fábrica de picolés o produto vai para a câmara no
dia seguinte, então a conta dizia 'não há nada para prometer' com o freezer cheio."

#### Leituras de ambiente

`a reading is a fact with a place, an hour and a unit — typed today, sensor tomorrow`
(`src/data/repository.test.ts:2605`): quatro leituras em dois lugares e duas
grandezas; `lastReadings` devolve **3** ("uma última por lugar e por grandeza"), a
última da câmara é `-12.1` e não a primeira, a umidade traz `unit: '%'` e
`source: 'zigbee'` ("a origem viaja com a leitura"); `readingsBetween` devolve
`[-18.4, -12.1]` **com a fração inteira** — "-18,4 arredondado para -18 é meio
grau de freezer, e é exatamente o tipo de perda que o projeto proíbe em dinheiro
e vale aqui"; unidade em branco é recusada com `/unidade/` porque "4 é geladeira
boa em Celsius e freezer quebrado em Fahrenheit"; e a travessia leva
`recorded_by: 'quem-mediu'` e `device_id: null` — "digitada não tem aparelho, e
isso não é lacuna".

**Um defeito de higiene medido nesta auditoria:** este arquivo tem duas linhas de
`console.log` de depuração esquecidas dentro do último teste
(`src/data/repository.test.ts:3381-3382`), imprimindo `[dbg] lote:` e um dump de
movimentos a cada execução da suíte. Não afeta o resultado; é sujeira.
