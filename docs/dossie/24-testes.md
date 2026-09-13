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

---

### 24.6 A travessia aparelho → servidor

Quatro arquivos, e a divisão de trabalho entre eles é deliberada: o `db:verify`
"prova isto de ponta a ponta — a fila de uma sessão real reproduzida num Postgres
real — e é a prova honesta. Ele também precisa de um banco e meio minuto, o que
significa que roda uma vez no fim em vez de enquanto alguém está digitando, e o
portão de mutação não o alcança de jeito nenhum" (`src/sync/agreement.test.ts:11-16`).

#### 24.6.1 `src/sync/columns.test.ts` — 1 teste, 123 linhas

**Regra: toda coluna do aparelho ou atravessa, ou está escrita como sendo só
daqui.** Implementado e ativo. Técnica T2 + T4.

**A cicatriz** (`src/sync/columns.test.ts:9-15`): `items.full_level` — a régua das
faixas de cor que o dono digita — "ficou fora do serializador. A coluna existia no
aparelho, a tela escrevia nela, o teste do repositório provava que ela persistia,
e ela simplesmente nunca chegaria ao servidor. **Um celular novo da mesma fábrica
abriria sem faixa nenhuma, e ninguém saberia por quê.**"

E o andar (`src/sync/columns.test.ts:17-18`): "o guard da sessão do aparelho cobra
TABELA sem escritor. Este cobra COLUNA sem travessia, que é um andar abaixo e foi
o andar onde o defeito estava."

`every device column either crosses to the server or says why it stays`
(`src/sync/columns.test.ts:89-123`): para cada tabela em
`CROSSINGS_FOR_TESTS_ONLY()`, roda `PRAGMA table_info` num banco migrado (tabelas
com zero colunas são puladas — "`erase` e os derivados não são tabelas do
aparelho"), monta o conjunto de colunas enviadas como `crossing.take ?? []` **mais
as chaves de `crossing.build?.({}, { userId: 'x' })`** — e a razão de chamar o
`build` está escrita (`src/sync/columns.test.ts:99-101`): "o jeito honesto de saber
QUAIS é chamá-lo: uma lista escrita à mão ao lado dele seria a mesma lista à mão
que já deixou uma pasta fora da checagem de camadas."

**O registro `SO_DO_APARELHO`** (`src/sync/columns.test.ts:26-53`), transcrito —
"cada linha é uma decisão, não um esquecimento":

| tabela.coluna | motivo escrito |
|---|---|
| `items` | (nenhuma hoje — a lista existe para o dia em que houver) |
| `movements.recorded_by` | "o servidor estampa a partir da sessão; vindo do aparelho seria cedível" |
| `readings.recorded_by` | "o servidor estampa a partir da sessão; vindo do aparelho seria cedível" |
| `purchases.created_by` | "o servidor estampa a partir da sessão" |
| `purchase_lines.created_at` | "o servidor não tem a coluna; a hora que interessa é a da nota" |
| `orders.recorded_by` | "o servidor estampa a partir da sessão" |

Registro em vez de heurística, pelo mesmo motivo do `law.test.ts`
(`src/sync/columns.test.ts:20-22`): "existem colunas que legitimamente não sobem, e
a diferença entre 'não sobe porque é do aparelho' e 'não sobe porque alguém
esqueceu' não está no nome dela — está numa decisão, que aqui fica escrita."

#### 24.6.2 `src/sync/serialize.test.ts` — 11 testes, 159 linhas

**Regra: o que o serializador faz com cada linha.** Implementado e ativo. Técnica
T1 (chama `serialize` com objetos crus).

| teste | linha | regra presa |
|---|---|---|
| `SQLite has no boolean, and Postgres will not pretend otherwise` | 21 | `active: 1` → `true`, `active: 0` → `false`. "Enviado como 1, o Postgres recusa o insert de saída — ele não converte" |
| `the packaging travels as a structure, not as the text it is stored in` | 34 | a string JSON de `packaging` vira **array**. "A falha que isso previne ainda parece um sucesso: o Postgres guarda felizmente uma string entre aspas numa coluna jsonb, e a embalagem fica inutilizável do outro lado sem nada reclamar" |
| `a column the server does not have stays behind` | 51 | `purchase_lines.created_at` **não** vai. "É a contabilidade própria deste aparelho. Enviada, é um erro — uma coluna que não existe é recusada, não ignorada" |
| `who wrote it and who was holding it are two answers` | 65 | `recorded_by = ACTOR.userId` **e** `operator_id = 'the-one-holding-the-phone'` |
| `a company that names nobody still records the movement` | 86 | `operator_id: null` **explícito**, não coluna ausente. "A travessia nomeia o que ela promete atravessar, e uma coluna que sumisse do payload seria indistinguível de uma que ninguém ensinou a mandar" |
| `who did it is stamped on the way out, because the device has no user` | 98 | `movements.recorded_by` e `purchases.created_by`, ambos do ator. "As duas colunas são NOT NULL no servidor e referenciam um usuário real. O celular trabalha offline, sozinho: quem está entrando é conhecido na hora de sincronizar" |
| `the order somebody put the ingredients in goes with them` | 109 | `recipe_lines.position = 2`. "Uma ficha técnica é lida de cima para baixo enquanto alguém está trabalhando, e quem a escreveu pôs a base primeiro de propósito" |
| `a derived number does not travel, and says so instead of being dropped` | 122 | `item_costs` devolve `{ kind: 'derived' }` e **não** está em `sendableTables`. "Não silêncio: silêncio é como uma escrita que nunca chega fica exatamente igual a uma que chegou" |
| `a table nobody taught this file about is a refusal, never a skip` | 131 | `production_runs` lança `UnknownTableError`. O exemplo mudou porque "o exemplo VIROU verdade: `lots` era a tabela desconhecida deste teste até a Fase 2 ensinar o serializador a mandá-la. `production_runs` nunca vai ser conhecida: corrida aberta é ESTADO do aparelho, não lançamento — o servidor não tem onde guardá-la e não deve ter" |
| `a queued row that has gone missing is loud` | 143 | linha nula lança `/gone from the device/` |
| `the erase command carries its area, not a row` | 147 | `{ kind: 'erase', area: 'all' }` |

A decisão de produto por trás do teste da linha 65 está transcrita no próprio
arquivo (`src/sync/serialize.test.ts:66-74`): "o login autentica o SISTEMA: a conta
pertence à empresa, que distribui acesso criando outros e-mails ou mandando código
de convite por perfil. Então `recorded_by` é essa conta — o servidor impõe
`recorded_by = auth.uid()` e ninguém entra em nome de outro — enquanto quem estava
operando de fato é anotado no momento do registro. **Uma coluna respondendo as
duas foi o erro que isto substituiu.** Separadas, um celular compartilhado deixa
de ser problema de autenticação e passa a ser uma pergunta a mais na tela, para a
empresa que quiser fazê-la."

#### 24.6.3 `src/sync/agreement.test.ts` — 12 testes, 436 linhas

**Regra: os dois esquemas concordam, e isso é provado lendo os dois.**
Implementado e ativo. Técnica T4 pura — nenhum banco é aberto.

**O que ele pode e não pode** (`src/sync/agreement.test.ts:18-22`): "não pode provar
comportamento. Pode provar acordo, que é onde viveu cada um dos desencontros de
hoje: uma coluna que existe só de um lado, um valor de enum escrito `storeroom`
contra o `store_room` do servidor, um tipo que o aparelho escreve e o servidor
nunca ouviu falar."

**A honestidade sobre o método** (`src/sync/agreement.test.ts:24-28`): "ler o SQL com
expressões regulares é grosseiro e estaria errado para entrada arbitrária. Estas
são as migrações deste repositório, append-only e escritas à mão, e a análise
**afirma que achou algo antes de confiar em si mesma** — um analisador que casasse
silenciosamente com nada transformaria este arquivo inteiro num teste que sempre
passa."

O analisador `serverColumns` (`src/sync/agreement.test.ts:49-90`) monta
`Map<tabela, Map<coluna, {notNull, hasDefault}>>` na ordem **cria → acrescenta →
remove**, "porque uma coluna removida num passo posterior não está mais lá, e a
0009 remove uma que este aparelho enviava". `hasDefault` é verdadeiro se a linha
tem `default` **ou** `primary key` — "uma chave primária com id gerado também não
precisa de nada do aparelho". Os `ALTER` são lidos **statement por statement**
(`split(';')`) porque "um ALTER atravessa linhas e carrega um `if not exists`
opcional — a primeira versão deste analisador leu aquele `if` como o nome da
coluna e reportou `items.base_unit` como faltando quando o servidor a tem desde a
0003. **Um analisador errado nessa direção é barulhento; um errado na outra
direção transforma o arquivo inteiro num teste que sempre passa.**"

| teste | linha | regra presa |
|---|---|---|
| `every column this device sends exists on the server` | 111 | para toda `sendableTables`, cada chave de `serialize(entry(t), {}, ACTOR).row` existe no servidor. Canários do **analisador**: `items.name` (coluna de CREATE), `items.base_unit` (acrescentada por ALTER) e `movements.unit_cost_cents` **ausente** (removida por ALTER) |
| `every movement kind the device writes is a kind the server knows` | 146 | extrai de `repository.ts` os `INSERT INTO movements … VALUES (?, ?, '<kind>'` e confere contra o enum `movement_kind`. "Lido do repositório em vez de listado aqui, para um tipo acrescentado amanhã ser conferido sem ninguém lembrar de atualizar este teste" |
| `a check that matched is a row the server would accept` | 167 | a **última** definição de `constraint movement_moved_something` casa `/kind = 'discrepancy' and post is not null/`, e o repositório escreve exatamente esse par. "A regra que quase impediu a conferência de existir: o servidor recusa linha que não move nada. 'Conferi e bateu' é diferença zero — e é a conferência que mais vale, porque é a prova de que alguém abriu a caixa" |
| `the words the device has for a loss are words the server accepts` | 193 | lê `export type LossReason` de `src/domain/ledger.ts` e confere contra o enum `loss_reason`. **O desencontro para o qual o arquivo foi escrito e que escapou de qualquer forma:** "o aparelho dizia `internalUse` e o enum do servidor diz `internal_use`. Nenhuma perda nunca foi escrita, então foi grátis consertar — a primeira teria sido aceita pelo SQLite, enfileirada, e recusada pelo Postgres sem ninguém olhando" |
| `the location this device creates is a kind the server knows` | 219 | **o defeito exato que a reprodução pegou: `storeroom` contra `store_room`.** "A fila para num vão de chave estrangeira, então aquela linha teria bloqueado toda escrita atrás dela" |
| `the device schema does not carry a column the server dropped` | 238 | `item_costs.on_hand_base_units` ausente no servidor **e** `db.ts` contém o `ALTER TABLE item_costs DROP COLUMN on_hand_base_units` |
| `the capability vocabulary is the same word list on both sides` | 253 | `[...capabilities].sort()` **deepEqual** ao enum `capability` do Postgres. "Uma capacidade que o código conhece e o servidor não é uma política que silenciosamente nunca casa; uma que o servidor conhece e o código não é uma porta que ninguém deste lado pode abrir" |
| `nothing the server insists on is left for the device to forget` | 268 | a direção inversa: toda coluna `not null` **sem default** está no payload. O caso que a reprodução achou do jeito difícil: "`purchases.freight_cents` é `not null default 0`, e um insert que nomeia suas colunas deixa o default fazer o trabalho — enquanto um que manda toda coluna com NULL nas silenciosas o derrota e é recusado" |
| `the parser can tell a required column from a defaulted one` | 302 | canários: `movements.recorded_by` é `notNull: true, hasDefault: false`; `purchases.freight_cents` tem default; `movements.note` não é notNull. "Sem estes, o teste acima está medindo o analisador" |
| `the movement type names only columns the ledger actually has` | 328 | lê `export type Movement = {` de `src/domain/ledger.ts`, converte camelCase→snake_case, e exige que cada campo nomeie uma coluna real |
| `what the device does not keep is a list somebody wrote, not a surprise` | 361 | a direção "lacuna, não mentira": todo campo de `Movement` está no esquema do aparelho **ou** na lista `known = ['recorded_by']`; e a lista tem de **apodrecer em voz alta** — entrada que alega lacuna já fechada reprova |
| `every table the device queues is a table something knows how to send` | 399 | toda tabela num `table: '…'` do repositório está em `sendableTables` **ou** é comando tratado por `entry.table === '…'` em `serialize.ts` |

Dois docblocks longos merecem transcrição:

**A deriva que sobreviveu dias à vista** (`src/sync/agreement.test.ts:314-327`): "a
0008 derrubou `unit_cost_cents` no servidor e acrescentou `unit_cost_rate`; o
aparelho seguiu; e `src/domain/ledger.ts` continuou declarando
`unitCostCents?: Cents` — **a inversão exata da regra de capa deste projeto,
sentada no tipo que define o que um movimento É.** Nada pegou, e a razão é o
achado: nenhuma linha de código de produção importa aquele módulo, então nenhum
teste o exercitou e nenhum erro de compilação podia surgir. **Um tipo que ninguém
usa não é inofensivo — é uma mentira esperando o primeiro chamador**, e o primeiro
chamador aqui é a tela de produção."

**O guarda que só olhava um lado** (`src/sync/agreement.test.ts:400-410`): "faltava
o inverso, e o inverso é o que machuca — uma tabela que o repositório enfileira e
ninguém sabe enviar não é erro de compilação nem teste vermelho: é
`UnknownTableError` no meio da fila, e a fila é enviada em ordem. A linha recusada
nunca sai da frente, e TUDO que foi escrito depois dela fica preso atrás —
inclusive movimento. Aconteceu de novo com `product_lines`, `product_types` e
`flavors`: três tabelas novas, três `enqueue`, nenhuma travessia."

#### 24.6.4 `src/sync/sync.test.ts` — 9 testes, 241 linhas

**Regra: a fila e o motor, contra um banco de verdade e um servidor falso.**
Implementado e ativo. Técnica T2 + T5.

**As falhas que valem pegar** (`src/sync/sync.test.ts:11-18`): "as silenciosas: uma
escrita que nunca foi enfileirada e por isso nunca sincroniza, e uma entrada
marcada como enviada que o servidor nunca guardou de fato. Nenhuma das duas
aparece como erro — as duas aparecem meses depois como um número que não bate."

O teste central é `every write queues itself, and nothing writes without queueing`
(`src/sync/sync.test.ts:64-119`), que afirma a **ordem exata** da fila depois de
salvar um insumo, lançar uma compra e salvar uma receita:

```
['items', 'locations', 'purchases', 'purchase_lines', 'movements',
 'recipes', 'recipe_versions', 'recipe_lines']
```

Cada entrada tem comentário de razão (`src/sync/sync.test.ts:93-116`):
`locations` vem "enfileirada na única vez em que é criada — e à frente do
movimento que se apoia nela, que é o que impede a primeira sincronização de falhar
numa chave estrangeira"; `purchase_lines` porque "o gatilho de custeio do servidor
dispara num insert em `purchase_lines`, então um cabeçalho sozinho reproduz como
uma nota que não moveu custo e não escreveu história"; `movements` porque "um
movimento escrito num freezer sem sinal tem de chegar ao servidor como o registro
que já é"; e **`item_costs` está deliberadamente ausente**: "a média é derivada, e
um número derivado tem um autor: este aparelho computa o seu para sobreviver
offline, o servidor computa o seu a partir destas mesmas linhas. **Mandar os dois
deu à cifra dois autores e eles discordaram na primeira reprodução real.**"

| teste | linha | regra presa |
|---|---|---|
| `a failed write leaves nothing behind, in the data or in the queue` | 121 | linha de receita apontando para item inexistente reverte tudo: `pendingCount() === 0` |
| `erasing queues the decision, so the server does not send it all back` | 137 | uma entrada, `op: 'delete'`, `rowId: 'products'` |
| `the queue goes up in the order it was written` | 149 | `items` antes de `purchases`, `recipes` antes de `recipe_versions` |
| `only what the server confirmed is marked sent` | 164 | um servidor que aceita metade reporta erro casando `/aceitou/`, e `remaining === before − sent` **na linha** |
| `a server that throws loses nothing and retries with backoff` | 183 | `sent: 0`, `remaining` intacto, `attempts: 3`, e as esperas são exatamente `[1000, 2000]` — "espera mais a cada vez, e não depois da última" |
| `sending the same queue twice is harmless` | 208 | a segunda passada tem `sent: 0`, `batches: 0`, `remaining: 0` |
| `a queue longer than one batch goes up in order, batch after batch` | 221 | com `batchSize: 3`, mais de um lote e **nenhuma entrada enviada duas vezes** |
| `backoff grows and then stops growing` | 234 | `backoffMs`: `0→0`, `1→1000`, `2→2000`, `3→4000`, `99→60000`. "Um celular que passou a noite num freezer deve tentar de novo por hora, não por semana" |

---

### 24.7 O domínio: aritmética pura (T1)

Dezessete arquivos, 108 testes. Nenhum abre banco, nenhum lê arquivo. Todos
importam a função e comparam números — e por isso **nenhum deles prova que uma
tela chama a função**. Essa metade é trabalho de `layers.test.ts` e do e2e.

#### 24.7.1 `src/domain/money.test.ts` — 8 testes, 121 linhas

**O ponto único de arredondamento do sistema.** Implementado e chamado por tela.

**Por que o arquivo existe** (`src/domain/money.test.ts:18-24`): "por causa de uma
checagem de mutação: o `Math.round` em `amountOf` foi discretamente trocado por
`Math.floor` e a suíte inteira — **noventa e dois testes** — continuou verde. Toda
fixação caía por acaso num centavo exato, então os dois se comportavam igual e a
regra de capa do projeto ('só o valor final arredonda, uma vez') não tinha nada
segurando-a no lugar."

E a direção não é detalhe (`src/domain/money.test.ts:26-29`): "cortar para baixo
descarta uma fração de centavo em cada linha, sempre para baixo, e esse erro
acumula numa direção só ao longo de uma receita: o custo sai baixo, a margem sai
alta, e alguém precifica abaixo do custo sem um único número nunca parecer errado."

| teste | linha | asserções exatas |
|---|---|---|
| `the amount rounds to nearest, and not downward` | 32 | `amountOf(0.5, 1) = 1`; `amountOf(0.125, 5) = 1`; `amountOf(0.4, 1) = 0`; `amountOf(0.472, 1233) = 582`; `amountOf(0.472, 1235) = 583` |
| `rounding never accumulates in one direction across many lines` | 44 | dez linhas de `amountOf(0.51, 1)` somam **10**. "Cortadas para baixo dariam nada, e a receita que se apoia nelas é subestimada em todo o seu valor" |
| `a rate is fractional cents, and stays fractional` | 55 | `rate(12.4, 1000) ≈ 1.24` com erro < 1e-12, e `Math.round(pulp) !== pulp`. "O bug pelo qual toda esta divisão de tipos existe: como dinheiro teria sido um único centavo, perdendo um quinto antes da primeira multiplicação" |
| `money in and money out are the same number` | 65 | `fromDecimal(118.35) = 11_835`; `toDecimal(11_835) = 118.35`; `amountOf(rateFromCents(11835, 25000), 25000) = 11_835` |
| `splitting a total never invents or loses a cent` | 75 | `allocateCents(100, 3) = [34, 33, 33]`; `allocateByWeight(100, [1,1,1])` soma 100; `allocateByWeight(7, [90,5,5])` soma **7** |
| `nothing to split is nothing, not a crash` | 99 | `allocateByWeight(0,[1,2]) = [0,0]`; `allocateByWeight(10,[]) = []`; `allocateByWeight(10,[0,0]) = [0,0]`; `rate(12.4, 0) = 0`; `rateFromCents(100, 0) = 0` |
| `a Cents value is always whole` | 107 | `cents(10.6) = 11` — o construtor impõe o inteiro |
| `multiplying money rounds once, at the end, and never drifts` | 112 | `multiplyCents(1000, 0.333) = 333`; `multiplyCents(1000, 1/3) = 333`; `multiplyCents(5, 0.5) = 3`; `multiplyCents(0, 99) = 0` |

#### 24.7.2 `src/domain/units.test.ts` — 5 testes, 87 linhas

**A invariante de embalagem, "que estava escrita e nunca era executada"**
(`src/domain/units.test.ts:5-13`). Duas coisas que toda conversão confia:
"o primeiro nível é a unidade-base, e cada nível é maior que o anterior. Quebre
qualquer um e a decomposição silenciosamente produz absurdo que continua
parecendo uma quantidade."

| teste | linha | asserção |
|---|---|---|
| `a hierarchy has to start at one and climb` | 23 | `unit:1, box:50, crate:300` → `true` |
| `a first tier that is not the base unit is refused` | 27 | começar em 50 → `false`. "Não falha; silenciosamente multiplica toda quantidade por 50" |
| `tiers out of order, or repeated, are refused` | 36 | fora de ordem → `false`; **dois níveis do mesmo tamanho** → `false`, porque "igual não é 'maior que': dois níveis do mesmo tamanho deixam a decomposição ambígua, e ela escolheria um em silêncio" |
| `an empty hierarchy is refused rather than treated as "just units"` | 62 | `{ tiers: [] }` → `false` |
| `a box is an object, and something with no box is never counted as one` | 68 | `boxesOf(1300, {unit:1,box:50,crate:600}) = { boxes: 2, loose: 100 }` — **a camada MAIOR é a que conta como volume**; `boxesOf(6000, {g:1}) = null` "para a tela dizer em grama, em vez de somar um volume que não existe"; `boxesOf(430, …) = { boxes: 0, loose: 430 }` — "nunca '1 caixa' arredondada" |

#### 24.7.3 `src/domain/measure.test.ts` — 3 testes, 33 linhas

**Regra: o tamanho impresso no saco é lido, não perguntado.** (Lei 1 — nunca peça
o que o sistema pode deduzir.)

- `the size printed on the sack is read, not asked for` (`:5`):
  `packSize('saco 25 kg','g') = 25_000`; `'balde 10kg'` → `10_000`;
  `'caixa 1,5 L','ml'` → `1_500`; `'garrafa 500 ml','ml'` → `500`;
  `'pacote 12 unidades','un'` → `12`.
- `what cannot be read with certainty is left for the person` (`:13`): `'balde'`
  → `null`; **`'pacote 500 g 12 unidades'` → `null`** — "a forma perigosa é a em
  que AMBOS são legíveis: um rótulo 'pacote 500 g, 12 unidades' pegaria o que
  viesse primeiro e o poria debaixo de todo custo daquele item";
  `'caixa 6 x 500 ml'` → `null`; `'saco 25 lb','g'` → `null`;
  `'saco 25 kg','oz'` → `null`; **`'garrafa 2 L','g'` → `null`** — "volume
  escrito contra uma unidade-base de massa é um erro que vale recusar".
- `a fraction of a base unit is refused rather than rounded` (`:28`):
  `'ampola 0,0025 kg','g'` → `null` ("0,0025 kg são 2,5 g; arredondar isso põe um
  fator errado debaixo de todo custo que o item tocar, e ninguém nunca acharia");
  `'frasco 0,5 kg','g'` → `500`.

#### 24.7.4 `src/domain/number.test.ts` — 6 testes, 62 linhas

**Regra: a mesma digitação é o mesmo número, qualquer separador que o teclado
tenha dado.**

| teste | linha | asserção |
|---|---|---|
| `the same typing means the same number, whichever separator the phone gave` | 5 | `'118,50'` e `'118.50'` → `118.5`; `'1.000,00'` e `'1000.00'` → `1000` |
| `a thousand grams is a thousand, not one` | 15 | `'46.000'` → `46000`; `'1.500'` → `1500`; `'25.000'` → `25000`; `'1.250.400'` → `1250400`. "O leitor que só trocava a vírgula fazia 46.000 g de açúcar em 46 g, e escrevia isso no livro-razão sem uma palavra" |
| `half of something keeps its half` | 24 | `'0.500'` e `'0,500'` → `0.5`; `'1.5'` → `1.5`; `'2,5'` → `2.5`. "Três dígitos depois do ponto leem como agrupamento — a menos que não haja nada para agrupar, que é o que um zero inicial significa" |
| `what is not a number is refused, not guessed` | 33 | `''`, `'abc'`, `'kg'` → `null`; `'-3'` → `-3` |
| `writing a number back and reading it returns the same number` | 40 | **propriedade fechada**: para `pt-BR`, `en-US` e `es-MX`, e para `2.5, 0.5, 7.5, 12.4, 1250, 46000, 1.25, 506, 0.075`, `parseTyped(formatTyped(v, f)) === v`. "Uma tela de receita escreveu `String(2.5)`, leu com um leitor que apagava o ponto, e virou uma perda de 2,5% em 25% com ninguém tocando no campo" |
| `a field never receives a grouping separator` | 55 | `formatTyped(1500,'pt-BR') = '1500'`; `formatTyped(46000,'pt-BR') = '46000'`; `formatTyped(2.5,'pt-BR') = '2,5'`; `formatTyped(2.5,'en-US') = '2.5'`. "Agrupamento num campo é a própria ambiguidade: '1.500' não pode ser lido de volta com certeza por ninguém, incluindo nós" |

#### 24.7.5 `src/domain/ledger.test.ts` — 1 teste, 24 linhas

O arquivo mais curto, e o mais instrutivo sobre o portão P1 do projeto.

`days of cover turns a quantity into the sentence somebody can act on`
(`src/domain/ledger.test.ts:15`): `daysOfCover(70_000, 10_000) = 7`;
`daysOfCover(70_000, 0) = null`; `daysOfCover(70_000, −5) = null` — "nada saindo
não é 'dias infinitos' e não é zero: é sem resposta, e dizer isso é melhor que
imprimir um número que não significa nada". A razão do formato:
"'Morango: 4 dias' diz ao dono para produzir. 'Morango: 70.000 g' não, e essa
diferença é o ponto inteiro do briefing."

**E o que saiu** (`src/domain/ledger.test.ts:5-12`): "aqui havia também os testes de
`balanceAt` e `balanceOf`, escritos porque 'nada as chamava e nada as checava'.
**Escrever teste não trouxe chamador**: as duas dobravam sobre `Movement[]`, e o
aplicativo nunca tem os movimentos em memória — ele tem SQLite, e a soma mora lá.
As funções saíram."

#### 24.7.6 `src/domain/lot.test.ts` — 3 testes, 42 linhas

- `the lot code says the day and the run, and sorts by itself` (`:5`):
  `lotCode('2026-09-02', 1) = '20260902-01'`; `lotCode('2026-09-02', 12) =
  '20260902-12'`; e ordenar como **texto** dá a ordem do tempo:
  `['20260831-09','20260902-03','20260910-01']` — "é assim que a lista de lotes de
  uma câmara fria fica legível sem ninguém escrever ORDER BY data".
- `validity is calendar days over the local date, never an instant` (`:15`):
  `expiresOn('2026-09-02', 180) = '2027-03-01'`; `(…, 1) = '2026-09-03'`;
  vira o ano (`'2026-12-30' + 5 = '2027-01-04'`) e o ano bissexto entra sozinho
  (`'2028-02-27' + 3 = '2028-03-01'`); e `null`, `0` e `−30` dão **`null`** —
  "produto sem prazo cadastrado gera lote SEM validade, e isso é um fato sobre o
  produto, não uma falha. Uma data inventada seria pior: ela vira descarte de
  mercadoria boa, ou venda de mercadoria vencida".
- `what is left of a lot is counted in days, and it goes negative` (`:31`):
  `3`, `0`, **`−1`** ("'venceu ontem' e 'vence em três dias' são decisões
  diferentes, e quem escolhe a frase é a tela"), `null` para data nula, e
  `daysUntilExpiry('2027-03-01','2026-09-02') = 180` — "contando dias de verdade,
  não trinta por mês".

#### 24.7.7 `src/domain/qr.test.ts` — 5 testes, 90 linhas

| teste | linha | asserção |
|---|---|---|
| `the lot code fits the smallest grid there is, and that is the whole point` | 5 | `qrModules('20260902-01')` é **21×21** — versão 1, "numa etiqueta de quatro centímetros isso dá 1,9 mm por módulo, o que faz a leitura a um braço de distância, de luva, ser possível"; e o uuid do mesmo lote pediria grade maior |
| `the three finder squares are where a reader looks for them` | 23 | os três olhos 7×7 nos cantos superior-esquerdo, superior-direito e inferior-esquerdo. "Se eles não estiverem lá, não é um QR — é um desenho" |
| `the same code always draws the same square` | 41 | mesma entrada, mesmo mapa; entradas diferentes, mapas diferentes. "Uma máscara escolhida ao acaso a cada chamada faria duas impressões do mesmo lote não baterem entre si" |
| `the white margin is part of the code, not part of the styling` | 53 | **`QUIET_ZONE === 4`** e **`span === 29`** escritos como literais; e nenhum módulo preto invade a margem (`4 ≤ x,y ≤ 24`) |
| `the correction level is the highest one, because here it costs nothing` | 76 | grade 21 e **exatamente 224 módulos pretos** — a assinatura do nível H |

**A lição sobre teste tautológico está aqui, por extenso**
(`src/domain/qr.test.ts:56-62`): "os números aqui são LITERAIS, e isso é o ponto. A
primeira versão deste teste escrevia `21 + QUIET_ZONE * 2` e importava a
constante — com isso os dois lados da igualdade mudavam juntos, e o teste não
tinha como falhar. **A mutação que zerava a margem passou por ele sem encostar.**
Teste que usa a própria constante para conferir a constante afirma apenas que a
aritmética do JavaScript funciona."

E a decisão do nível H foi **medida, não suposta** (`src/domain/qr.test.ts:77-84`):
"os quatro níveis cabem na mesma grade de 21 com onze caracteres — isso foi
MEDIDO, e derrubou a justificativa que este arquivo tinha escrito ('M para não
crescer a grade'). Com o tamanho igual, escolher menos correção é escolher menos
tolerância a gelo e arranhão de graça."

#### 24.7.8 `src/domain/day.test.ts` — 8 testes, 111 linhas

**Regra: o dia começa à meia-noite onde a fábrica está.** Fuso de referência:
`America/Sao_Paulo`, "em UTC−3 sem horário de verão desde 2019"
(`src/domain/day.test.ts:5`).

| teste | linha | asserção |
|---|---|---|
| `the day starts at midnight where the factory is, not at midnight in London` | 8 | `dayWindow('2026-09-01T12:00:00Z', SP)` = `{ from: '2026-09-01T03:00:00.000Z', to: '2026-09-02T03:00:00.000Z' }` |
| `a run at 23h50 local belongs to the day it happened` | 15 | `'2026-09-01T02:50:00Z'` cai na janela do dia **31** |
| `yesterday and today meet without overlapping` | 25 | `ontem.to === hoje.from`, e o instante da costura pertence a hoje **só** |
| `the same weekday a week back is seven days back, not five` | 36 | `dayWindow(…, SP, −7)` = 25→26 de agosto |
| `a zone that changes its clock still gets whole days` | 42 | Lisboa em 29/03/2026: `from '00:00Z'`, `to '23:00Z'` — **dia de 23 horas**. "Aritmética sobre blocos de 24 horas cairia uma hora dentro do dia seguinte" |
| `days are counted between local midnights, not by dividing milliseconds` | 51 | `daysBetween(20/08, 01/09, SP) = 12`; `daysBetween(25/03 23:00Z, 02/04 01:00Z, Lisboa) = 8`; mesmo dia em horas diferentes = **0**, "não 'quase um'". "A divisão crua daria 11,96 e arredondaria para 12 por sorte; num intervalo com duas viradas ela erraria" |
| `a calendar date is not an instant, and the difference is a whole day` | 62 | `dayWindow('2026-09-03T05:00:00Z','Europe/Madrid').from.slice(0,10) = '2026-09-02'` mas `localDate(…) = '2026-09-03'`. "O atalho devolve o dia ANTERIOR ali — e um pedido combinado para quinta apareceria como quarta para metade do mundo". Mais: `localDate('…T02:00:00Z', SP) = '2026-09-02'`; deslocamento `+7` vira mês; `−1` vira ano |
| `a week of days keeps the quiet days and counts by the factory clock` | 82 | `dailySeries` de 7 colunas terminando em hoje; a segunda soma **600** incluindo a corrida das 22h (que em UTC é terça); terça fica com **0** ("se o corte fosse por UTC, ela teria 100"); e **5** das 7 colunas são zero — "o domingo vazio é um fato sobre ela" |

#### 24.7.9 `src/domain/spark.test.ts` — 4 testes, 67 linhas

- `the line stays inside the box, ends included` (`:5`): o mais antigo em `x=0`, o
  mais novo em `x=100`, todo `y` entre 2 e 38; e **o maior valor fica no topo** —
  "y cresce para baixo em SVG, e trocar isso desenharia a semana de cabeça para
  baixo com o cartão inteiro parecendo certo".
- `a flat week draws in the middle, not on the floor` (`:23`):
  `sparkPoints([400,400,400], 90, 30)` dá `y = [15,15,15]`. "Uma fábrica que faz
  400 todo dia tem uma linha reta no meio. Grudada embaixo, o desenho contaria uma
  semana de fracasso que não aconteceu — e é o caso que a divisão por zero produz."
- `one point and none at all do not produce NaN in the path` (`:35`): um ponto não
  gera `NaN`; `sparkPath([]) = ''`; `sparkArea(um, 40) = ''`. "Um `d` com NaN apaga
  o desenho inteiro sem erro nenhum no console: o cartão fica vazio e ninguém sabe
  por quê. É o caso do primeiro dia da fábrica."
- `the curve passes through every point, and invents none` (`:48`): cada ponto da
  série aparece como destino de um segmento — "é o que separa Catmull-Rom de uma
  Bézier solta, que passa PERTO dos pontos. Perto, aqui, é a tela mostrando um dia
  que o banco não tem"; e a área fecha com `Z` e desce ao chão (`' L 120 40 '`).

#### 24.7.10 `src/domain/picking.test.ts` — 3 testes, 66 linhas

- `the order beats the habit, and the habit beats nothing` (`:5`):
  `pickSuggestion({ordered:300, lastSent:40}) = 300`;
  `{ordered:null, lastSent:40} = 40`; `{null,null} = null`;
  **`{ordered:0, lastSent:40} = 0`** — "zero pedido é um pedido de zero, não a
  ausência de pedido: a loja que pediu e cancelou não deve receber o envio da
  semana passada de volta". A escolha da fixação é cicatriz: "**as duas fontes
  DISCORDANDO é o único caso que prova a ordem**: com uma delas vazia, qualquer
  ordem dá o mesmo número — e um teste assim passa por acidente. Foi exatamente
  assim que este mutante sobreviveu duas vezes."
- `only a load that covers the whole order can close it` (`:24`): 300 picolés
  fecham o pedido A e não o B; **faltando uma única unidade (299) nada fecha** —
  "dizer 'entregue' quando faltaram caixas transforma uma falta que a loja vai
  cobrar num pedido que o sistema diz cumprido, e pedido não é livro-razão, então
  nada desmente depois"; mandar a mais fecha; carga vazia não fecha nada.
- `two loads on the same day cover an order that one alone would not` (`:50`):
  cada viagem sozinha não fecha; somadas, fecham. "Comparar a cobertura só com a
  carga do instante fazia um pedido de dois itens NUNCA fechar — e quem carrega o
  caminhão faz duas viagens até o freezer. O pedido é do dia, não da viagem."

#### 24.7.11 `src/domain/agreement.test.ts` — 5 testes, 58 linhas

Os dias combinados são um **bitmask de 7 bits**, e a numeração é a da plataforma.

- `the agreed days use the same weekday numbering as the platform` (`:5`): pede a
  um domingo real `getUTCDay()`, confere que é `0`, e que `WEEK_BITS[0] === 1`,
  `agreedOn(1, 0)` verdadeiro e `agreedOn(1, 1)` falso. "Se esta conta e a do
  JavaScript discordarem, toda entrega sai um dia fora e nada mais no app acusa."
- `a day goes in and comes out without disturbing the others` (`:15`):
  `toggleDay` é involução por dia, e tirar a sexta não tira a terça.
- `today counts as the next delivery, and no agreement invents none` (`:25`):
  `daysUntilNextDelivery(quinta, 4) = 0` ("o sistema não corrige quem está pedindo
  no dia certo"); `(quinta, 5) = 6`; `(quinta, 3) = 1`; **sem acordo → `null`** —
  "essa é a diferença entre não saber e chutar".
- `with two agreed days the nearest one wins` (`:39`): terça+sexta, de domingo → 2,
  de quarta → 2, de sábado → 3.
- `a weekday outside the week is refused instead of answering politely` (`:46`):
  `agreedOn(127, 7)`, `(…, −1)`, `toggleDay(127, 9)` e `agreedOn(127, 1.5)` lançam
  **`RangeError`**. "Um 'não' para o oitavo dia parece resposta e não é: quem passou
  7 tem um bug, e devolver `false` esconde o bug atrás de uma frase plausível na
  tela." E a semana inteira (127) responde dia a dia.

#### 24.7.12 `src/domain/access.test.ts` — 7 testes, 95 linhas

**A tabela de papéis presa, "porque as ausências são a decisão de produto"**
(`src/domain/access.test.ts:13-19`): "qualquer um pode acrescentar uma capacidade a
um papel por acidente e nada vai parecer errado: o app simplesmente mostra um
número a mais para uma pessoa a mais. Estes testes existem para que alargar um
papel seja um ato deliberado com uma suíte vermelha na frente."

As 12 capacidades (`src/domain/access.ts:26-39`): `view_cost`, `view_sale_price`,
`record_production`, `dispatch`, `check_receipt`, `record_loss`, `place_order`,
`approve_order`, `adjust_stock`, `view_finance`, `issue_invoice`,
`manage_company`. Os 7 papéis (`src/domain/access.ts:52-58`): `owner`, `operator`,
`storeManager`, `driver`, `buyer`, `customer`, `salesperson`.

| teste | linha | regra presa |
|---|---|---|
| `no role holds a permission the vocabulary does not have` | 24 | toda capacidade de todo papel está em `capabilities` |
| `every capability belongs to somebody` | 33 | nenhuma capacidade é órfã. "Uma permissão que nenhum papel pode ter é uma porta sem chave: parece funcionalidade no enum e não pode ser alcançada por nenhuma pessoa no produto" |
| `the factory floor never sees money` | 41 | `operator` e `driver` **não** têm `view_cost`, `view_sale_price` nem `view_finance`. "Não é desconfiança. O número é irrelevante para fazer um picolé, e a presença dele começa conversas sobre margem no chão de fábrica" |
| `only the owner can change who works here` | 54 | os que têm `manage_company` são exatamente `['owner']` |
| `nobody outside the company sees what anything costs` | 59 | `customer` e `salesperson` têm `view_sale_price` e **não** `view_cost`. "Para o vendedor esse é o desenho inteiro: a comissão é paga sobre margem e mostrada em reais, então o desconto machuca o bolso dele sem o custo nunca estar na tela" |
| `the owner can do everything, and is the only one who can` | 70 | `capabilitiesFor('owner').size === capabilities.length`, e todo outro papel é estritamente menor — "`${role}` é um segundo dono com outro nome" |
| `the floor stands apart from permission, and stays whole` | 82 | **`ALWAYS_CONFIRMED.length === 5`** e todos passam `needsHumanYes`; e o `buyer`, que **tem** `adjust_stock`, continua sendo perguntado |

`ALWAYS_CONFIRMED` (`src/domain/access.ts:135-140`) é
`['adjustStock', 'changePrice', 'reverseMovement', 'recordFinance',
'issueInvoice']` — "estes cinco atos são perguntados toda vez, em qualquer nível
de autonomia do assistente, porque são os erros que aparecem meses depois numa
margem que ninguém consegue explicar" (`src/domain/access.test.ts:83-86`).

#### 24.7.13 `src/domain/briefing.test.ts` — 4 testes, 70 linhas

**Regra: a casa decide a ordem e o aparelho decide o que esconder.** É a fundação
"depende vira dado" em uma função: duas listas, uma da empresa e uma do aparelho.

- `the house decides the order and the phone decides what to hide` (`:5`): a ordem
  da empresa manda e o que ela não ordenou entra no fim, na ordem do catálogo —
  "é isso que permite acrescentar peça nova numa versão futura sem que a fábrica
  inteira precise reconfigurar a capa"; `capa.length < BRIEFING_WIDGETS.length` e
  `'custo'` **não** nasce na capa — "dado disponível não é motivo para ocupar a
  tela que se olha de manhã" —, mas pedido pela casa ele entra; e as peças
  escondidas pelo aparelho saem sem mexer no que a casa combinou.
- `a widget that no longer exists disappears without breaking the rest` (`:31`):
  `'peca-que-nao-existe-mais'` é filtrada. "A preferência guardada é texto vindo do
  disco, e disco guarda o que a versão anterior escreveu — senão a capa quebra na
  atualização, no aparelho de quem já usava."
- `moving a widget stops at the ends instead of wrapping` (`:40`): subir a
  primeira não a manda para o fim. "Dar a volta faria a peça sumir do topo da tela
  num toque que a pessoa deu esperando não acontecer nada."
- `what is off the cover is offered, and putting it on is the house deciding`
  (`:52`): `[...capa, ...fora].sort()` **é** o catálogo inteiro sem repetição — "a
  tela de Ajustes não pode inventar nem esquecer peça nenhuma"; `addWidget` duas
  vezes não duplica.

#### 24.7.14 `src/domain/cost.test.ts` — 5 testes, 131 linhas

**Os três exports que a auditoria achou sem chamador e sem teste**
(`src/domain/cost.test.ts:13-22`): "não eram desleixo: cada um carrega uma decisão
que este projeto já tomou. O que eles eram é *não provados*, o que é pior que
ausente, porque **uma função exportada com docblock lê como uma capacidade**. Quem
as ligar a uma tela herda uma resposta que ninguém nunca conferiu."

| teste | linha | asserção |
|---|---|---|
| `a sequence of arrivals folds to the same average as posting them one by one` | 24 | `foldCostEvents` = `reduce(applyCostEvent)`; média **0,531** centavo/g e 200.000 unidades — "o número que o `db:verify` faz o Postgres computar independentemente" |
| `the unit price of one invoice is that invoice alone, not the average` | 40 | `purchaseUnitCost` de 25.000 g por R$ 118 = **0,472**. "A distinção que o comprador precisa em pé no fornecedor: quanto ESTA carga custa, não o que ela faz com a mistura quando cair" |
| `lead time is what the supplier did, not what they said` | 53 | 6, 6 e 3 dias observados → **5**; lista vazia → **`null`** ("nada comprado ainda não é 'zero dias', que leria como entrega instantânea"). "Três dias prometidos, seis entregues — e o ponto de recompra construído sobre a promessa é o que para a fábrica" |
| `the manufactured average is a blend, not the last run` | 81 | 1.000 a 0,50 mais 1.000 a 0,80 = **0,65**; 10.000 a 0,50 mais 100 a 0,80 fica entre 0,50 e 0,51; e a taxa **não passa por centavo inteiro**: 3 a 0,001 com 1 a 0,005 dá **0,002** com erro < 1e-12 |
| `stock in the negative counts as zero, like the purchase event does` | 116 | saldo −500 com chegada de 200 a 0,80 dá **0,80**; e estoque zero continua sendo identidade (1,2) |

**A cicatriz do `blendRate`** (`src/domain/cost.test.ts:68-79`): "é o único autor da
média do que sai do tacho, e nenhum teste a chamava com estoque em mãos: os que a
citam passam pelo caso em que ela é a identidade. **A mutação que troca o corpo
inteiro por `return arriving.rate` atravessava a suíte** — e o que ela faz na
fábrica é o estoque antigo passar a valer o preço da corrida de hoje. Ela só
apareceu quando a oficina do `mutate` voltou a rodar a suíte: **por 66 commits o
portão declarou todo defeito 'pego' sem consultar nada.**"

#### 24.7.15 `src/domain/alerts.test.ts` — 8 testes, 275 linhas

**Regra: o alerta dispara na data da decisão (Lei 4) e alerta inventado não
existe (Lei 7).** Implementado e chamado por tela e por notificação.

`DEFAULT_ALERTS` transcrito de `src/domain/alerts.ts:108-119`:

```
on:        { insumo: true, pedido: true, volume: false, validade: true, ambiente: true }
daysAhead: { insumo: 3, pedido: 2, validade: 7 }
bands:     { red: 25, yellow: 40, blue: 80, notifyFull: false }
minuteOfDay: 7 * 60          // 07:00
weekdays: 0                  // nenhum escolhido = todos
```

O ambiente nasce **ligado** e o volume **desligado**, e a diferença é o custo do
erro (`src/domain/alerts.ts:109-113`): "câmara fora de faixa estraga o estoque
inteiro em uma noite, e o aviso não depende de nenhuma régua que alguém precise
cadastrar antes."

| teste | linha | regra presa |
|---|---|---|
| `the alert fires on the decision date, not on the problem date` | 15 | polpa com 2 dias avisa, açúcar com 10 cala; o aviso carrega `amount: 2`. "É por isso que o piso é em DIAS e não em quantidade — quantidade não sabe quanto tempo leva para a compra chegar" |
| `an alert nobody can act on is not sent` | 39 | quatro casos: pedido já coberto (`missing: 0`), item **sem `fullLevel`** ("sem nível cheio, o app estaria inventando o que é pouco"), alarme desligado, e nada acontecendo |
| `the volume bands read the same in every item, and green is quiet` | 63 | `volumeBand`: `0/100 = 'zerado'`; `20 = 'vermelho'`; **`25 = 'vermelho'` ("o limite é do vermelho")**; `35 = 'amarelo'`; `60 = 'verde'`; `90 = 'azul'`; `120 = 'azul'`; `fullLevel` nulo ou 0 → `null`. E o verde **e o azul** não notificam por padrão; com `notifyFull: true` o azul avisa |
| `the most urgent alert comes first, because a notification holds one sentence` | 117 | ordem `['apertado', 'folgado', 'l1']` — "insumo antes de validade, e dentro de cada um o mais apertado primeiro" |
| `no chosen weekday means every day, never silence` | 137 | `weekdays: 0` avisa nos 7 dias. "A configuração vazia é o estado inicial de todo mundo. Se ela silenciasse, o aplicativo emudeceria sem ninguém ter pedido — e o dono descobriria no dia em que faltasse polpa" |
| `the next alert is never in the past` | 151 | `nextAlertAt` às 04:00 dá hoje 07:00; às 09:00 dá amanhã; **exatamente às 07:00 conta como passada** ("agendar para o instante presente é uma corrida que o sistema operacional ganha"); e com um dia só combinado, acha o próximo dele. `minuteOfDay: 5*60+30` dá 05:30 — "a fábrica que começa às cinco e meia: o minuto existe porque ela existe" |
| `the order alert counts stores, because that is the decision it feeds` | 189 | 3 itens em falta dentro do prazo, e **`places === 2`** em todos: a loja que espera três itens conta **uma** vez, e o pedido a 9 dias não entra nem conta loja. Pedido do dono: "'faltam 300 picolés' não diz se é uma loja para ligar ou quatro para reorganizar o dia" |
| `the cold room comes first, and a room with no range stays quiet` | 213 | a câmara vem **antes** do insumo ("insumo que acaba custa uma compra atrasada; câmara fora de faixa custa o estoque inteiro numa noite"); o aviso traz `unit: 'C'` ("4 é bom em C e quebrado em F") e `quantity: 'temperature'`; câmara **sem faixa** cala ("-18 é o número comum de freezer, não uma verdade") e dentro da faixa cala; desligado, nem a câmara aberta avisa |

#### 24.7.16 `src/domain/recipe.test.ts` — 24 testes, 518 linhas

O motor de custo. As fixações: açúcar a R$ 4,72/kg, polpa de morango a R$ 12,40/kg,
leite em pó a R$ 28,90/kg, palito a R$ 0,02 cada, saquinho a R$ 0,03
(`src/domain/recipe.test.ts:62-68`); `creamBase` rende 20.000 ml sem perda, e
`strawberry` rende 40.000 ml com **5% de perda**
(`src/domain/recipe.test.ts:70-99`).

| teste | linha | regra presa |
|---|---|---|
| `splitting an amount never loses or invents a cent` | 22 | `allocateCents(1000, 3) = [334, 333, 333]`, soma 1000 |
| `breakdown speaks in crates and boxes, not raw units` | 41 | 3658 → `[['crate',12],['box',1],['unit',8]]` |
| `rounding up fills the box instead of leaving loose units` | 52 | 1599 → 1600, `addedUnits: 1`, múltiplo de 50 |
| `loss makes the unit cost go up, not down` | 101 | `netYield = 38_000`; com 5% de perda o custo por unidade sobrevivente é **maior** |
| `a sub-recipe cascades into the parent cost` | 112 | `base.batchCents = round(2000×milkPowder + 3000×sugar)`; e a linha da sub-receita vale `round(base.perYieldUnit × 10_000)` |
| `a more expensive input moves every product that uses it` | 125 | açúcar dobrado move o custo — "usado direto e pela base de creme; os dois têm de mover" |
| `cost lines carry their share, so the app can say what dominates` | 141 | as frações somam 1 com erro < 1e-9 |
| `a recipe that contains itself raises instead of hanging` | 147 | ciclo A→B→A lança `RecipeCycleError` |
| `the packaging that leaves stock is inside the quoted unit cost` | 174 | `itemsRate: 2` soma 2 centavos; com `cents: 3` soma 5; **`packagingRatePerUnit`** com meio centavo dá 0,5 (e ×10 dá 5); quantidade 2 × 1,25 dá 2,5; item sem preço vale **0** "em vez de derrubar a conta" |
| `product cost adds per-unit packaging on top of the mix` | 209 | a diferença é exatamente a embalagem; `unitsPerBatch = floor(38000/75)` |
| `comparing versions reports the change in plain numbers` | 219 | cortar a perda de 8% para 5% deixa a unidade mais barata |
| `exploding a plan reaches raw items through sub-recipes` | 234 | 3 tachos pedem 54.000 g de polpa; o açúcar chega **duas vezes** (direto e pela base) |
| `the shopping list answers what is missing, not what the recipe asks for` | 247 | polpa: `needed 54.000`, `missing 0`; açúcar: `needed > 18.000` e `missing = needed − 10.000`; e a ordem é a da decisão — o que mais falta primeiro |
| `a plan sums several products into one shopping list, with the packaging` | 278 | o palito entra **por unidade prevista** (`(40.000 × 0,95)/75 ≈ 506`), e o leite em pó soma os dois caminhos. "Um plano é uma soma, não uma lista de listas" |
| `a plan of zero batches asks for nothing` | 308 | `[]` |
| `a purchase blends into the average in proportion to what is on hand` | 314 | 0,472 e depois exatamente `(0,472+0,59)/2` |
| `consuming stock leaves the average alone` | 337 | consumo não muda `averageRate`, e `baseUnits` cai |
| `the price move is the comparison the buyer needs while standing there` | 350 | `change` entre 0,05 e 0,06 |
| `the reorder point uses the observed lead time, not the promised one` | 360 | `reorderPoint(50, 6, 2) = 400`, e 6 dias > 3 dias |
| `cheap lines add up instead of each rounding away to nothing` | 376 | dez linhas de 0,4 centavo dão **`batchCents = 4`**, não zero; e as linhas mostradas somam exatamente a figura — "um `[por quê?]` cujas linhas não somam o número acima delas é pior que nenhum" |
| `the breakdown always sums to the figure, however the cents fall` | 409 | 3 × 3 × 0,3333 = 2,9997 → `batchCents = 3`, e as linhas são `[1, 1, 1]` |
| `a share is the line's real weight, not its rounded one` | 435 | a linha que vale menos de um centavo tem `share > 0`. "Senão 'o que domina esta receita' responde com ruído" |
| `a sub-recipe that is not there stops the costing, and names itself` | 471 | `MissingRecipeError` com a mensagem contendo `creamBase` |
| `an item with no invoice yet is free, and that is not the same thing` | 493 | custa 236 com a linha nova valendo 0, **de propósito assimétrico** |

**A cicatriz do arredondamento por linha** (`src/domain/recipe.test.ts:366-373`): "o
custo do tacho arredondava cada linha primeiro e somava os resultados, que é o
mesmo erro num casaco diferente: as linhas baratas desapareciam uma a uma e a
receita saía subestimada com todo passo intermediário parecendo perfeitamente
sensato."

**A assimetria entre receita ausente e item sem nota**
(`src/domain/recipe.test.ts:460-468`, `src/domain/recipe.test.ts:510-514`): "uma
checagem de mutação transformou o lançamento de receita-faltando num resultado de
custo zero e a suíte inteira continuou verde — a classe de erro existia e nada
nunca provou que ela disparava. **Essa é a metade perigosa**: uma base
semiacabada que desapareceu faria todo sabor apoiado nela ficar silenciosamente
mais barato, sem nenhum número nunca parecer errado." Já o item sem nota "tem
genuinamente custo nenhum, e a tela do almoxarifado já diz isso em palavras:
'ainda sem nota lançada'. Recusar custear a receita tornaria o app inutilizável no
primeiro dia, antes de qualquer nota existir."

E a cicatriz do `itemsRate` (`src/domain/recipe.test.ts:175-179`): "o `mutate` zerou
`itemsRate` e a suíte inteira continuou verde: a regra só era exercitada por tela,
e o `mutate` roda a suíte rápida. Sem este teste, a embalagem que sai do estoque
volta a ficar fora do custo cotado — e a produção congela um número maior que o
que **sete telas** prometeram."

#### 24.7.17 `src/domain/pipeline.test.ts` — 12 testes, 297 linhas

**Regra: os elos se sustentam JUNTOS.** É o único arquivo do domínio que testa a
cadeia inteira: nota → média → receita → preço de um picolé.

**Por que separado dos vizinhos** (`src/domain/pipeline.test.ts:24-31`): "os testes
de unidade ao lado provam cada elo por si. Estes provam que os elos se sustentam
*juntos*, porque aquela afirmação de ponta a ponta — **'você nunca atualiza um
preço, você só lança o que pagou'** — é a que o app faz na tela inicial."

| teste | linha | asserção com a conta aberta |
|---|---|---|
| `a purchase at a higher price raises the cost of the finished unit` | 65 | 40 kg de polpa a R$ 14,88 sobre 40 kg a R$ 12,40 dão média R$ 13,64/kg; **`before = 45` e `raised = 50` centavos por picolé**, com a conta feita à mão no comentário (`:88-94`): base 3.000 g × 0,472 = 1.416 centavos em 20.000 ml = 0,0708/ml; antes 18.000 × 1,240 + 10.000 × 0,0708 = 23.028 centavos sobre os 38.000 ml que sobrevivem à perda de 5% = 0,6060/ml × 75 = 45; depois 25.260/38.000 = 0,6647 × 75 = 50 |
| `the buyer sees the move against the last invoice, not against the average` | 99 | `priceMove` dá `6/118` ≈ 5,1%. "A média teria dito 2,5%; o que o comprador precisa ouvir é 5,1%" |
| `packaging is charged per unit, never smeared across the batch` | 121 | 5 centavos de embalagem somam 5 no custo unitário, "os mesmos 5 em cada uma das unidades que um tacho faz — que é a razão inteira de não poder morar no total do tacho"; `unitsPerBatch = floor(38.000/75)` |
| `a version comparison answers "did my change help" in cents per unit` | 134 | `cheaper: true`, `deltaCents < 0`, `percent < 0` |
| `an item with no purchase yet costs nothing rather than crashing a screen` | 157 | a linha da glucose vale 0 e `share` 0 |
| `an empty stock takes the first invoice as the whole average` | 174 | 10.000 g por R$ 124 → 1,24 |
| `rolling the price history back gives the cost before the recent invoices` | 194 | com dois movimentos de polpa na semana, **o mais antigo ganha**: `before.pulp = rate(12.4, 1000)`. "Voltar apenas o último passo reportaria uma alta de 9% como se fosse 2% — que é como uma sequência de aumentos se esconde à vista"; o que não moveu volta **idêntico** |
| `the price moves land on the finished unit, in reais` | 218 | `unitNow = 40`, `unitBefore = 33`, diferença **7 centavos por unidade** — "e ninguém digitou um preço". Conta aberta no comentário (`:248-251`) |
| `nothing moved means the comparison says nothing, not zero-ish noise` | 257 | `ratesBefore(now, [])` devolve as taxas atuais |
| `the price verdict names its buckets, and the boundaries are exact` | 268 | `judgePriceChange(0.41) = 'wellAbove'`; `(0.02)` e `(0)` = `'smallChange'`; `(−0.05) = 'cheaper'`; **exatamente no limiar não é passar dele**: `PRICE_ALARM` e `PRICE_RELIEF` dão `'smallChange'`, e `±1e-9` além viram `'wellAbove'` e `'cheaper'` |
| `it takes more to raise an alarm than to call something cheaper` | 282 | `PRICE_ALARM > |PRICE_RELIEF|`; +4% é ruído, −4% "vale dizer". **Deliberadamente assimétrico**: "um alarme falso ensina as pessoas a ignorar alarmes, e então o de verdade chega e é ignorado também" |
| `the reorder point rounds up, because half a sack is not a sack` | 290 | `reorderPoint(1.6, 1, 1) = 4`; `(10, 3, 2) = 50`; `(0.1, 1, 0) = 1` — "um fiozinho ainda precisa de um". "Arredondar para baixo encomenda menos que o consumo de que foi calculado, que é a única direção em que um ponto de recompra nunca pode errar" |

Os limiares reais (`src/domain/cost.ts:233-234`): **`PRICE_ALARM = 0.05`** e
**`PRICE_RELIEF = -0.02`**. O veredito "viveu como quatro números mágicos dentro de
JSX, escritos de três maneiras diferentes no mesmo cartão, e nada o testava"
(`src/domain/pipeline.test.ts:262-265`).

---

### 24.8 i18n, notificação, clima

#### 24.8.1 `src/i18n/i18n.test.ts` — 7 testes, 191 linhas

**Regra: `Widen<T>` obriga a chave; este arquivo obriga o buraco dentro da frase.**

**A fresta que o tipo não vê** (`src/i18n/i18n.test.ts:9-16`): "'Ontem foram
{{amount}}.' traduzido como 'Yesterday.' compila limpo, e a tela imprime uma frase
sem o número — que é a Lei 3 desligada em silêncio, **no idioma que ninguém desta
sala lê para conferir.**"

| teste | linha | regra presa |
|---|---|---|
| `a translation keeps every hole the original has` | 38 | achata `ptBR` em folhas com caminho (`app.home.costWas`), e para `en` e `es` exige que a folha exista **e** tenha exatamente os mesmos `{{marcadores}}`, ordenados. Canário: `base.size > 300` |
| `a number handed to a sentence with nowhere to put it still gets said` | 59 | `plural(3, {one:'1 caixa', other:'{{n}} caixas'}, '1.200')` = `'1.200 caixas'`; **`plural(300, {one:'unidade', other:'unidades'}, '300')` = `'300 unidades'`** — a entrada sem buraco recebe o número prefixado, "e o cartão da capa saiu dizendo 'unidades' sem quantidade nenhuma num aviso cujo assunto inteiro é a quantidade"; e `{one:'um tacho', other:'{{n}} tachos'}` com 1 dá **`'um tacho'`**, não "1 um tacho" — "foi o que o e2e pegou quando esta regra olhava a forma escolhida em vez da entrada inteira"; sem número, nada muda |
| `a hole nobody filled stays visible instead of becoming a blank` | 81 | `fill('Ontem foram {{amount}}.', {})` devolve o marcador **visível**. "Some com o valor e a frase vira 'Ontem foram .' — um erro que parece texto." E `defaultLocale.language === 'pt-BR'` |
| `the weekday name matches the number the platform uses` | 88 | para os 7 dias, `formatWeekdayShort(dia, defaultLocale)` é igual ao `Intl.DateTimeFormat('pt-BR', {weekday:'short', timeZone:'UTC'})` do dia correspondente a partir de um domingo real. "Se esta tabela andar um dia, a loja de terça passa a receber na quarta e nada mais no app acusa" |
| `the currency decides the region, so the same amount reads right in each place` | 113 | `formattingFor('pt-BR','BRL') = 'pt-BR'`; **`formattingFor('pt-BR','USD') = 'pt-BR'`** ("português não muda de formato com a moeda"); `('es','MXN') = 'es-MX'`; `('es','EUR') = 'es-ES'`; `('en','USD') = 'en-US'`; **moeda fora da lista cai no idioma sozinho** (`('es','JPY') = 'es'`) — "pior formato, nunca erro". E a prova: R$ 12.345,67 sai `12,345.67` no México e `12.345,67` na Espanha |
| `what the drawer holds is never trusted, field by field` | 148 | `localeFrom({}, padrao)` = padrão; idioma inválido **não** derruba a moeda (`{language:'klingon', currency:'MXN'}` → pt-BR + MXN) e vice-versa (`{language:'es', currency:'XXX'}` → es + BRL, e `formatting: 'es-BR'` — "o formato acompanha a moeda que **valeu**, não a pedida"); e fuso sem barra é recusado (`'GMT-3'` cai no padrão) porque "um fuso inválido faria a data do lote **estourar** em vez de sair errada — pior, porque a tela quebra" |
| `every currency the app offers has a name in all three languages, and formats` | 171 | toda moeda de `CURRENCIES` passa `isCurrency`, tem região de 2 letras, tem nome com > 2 caracteres nos três dicionários, e formata sem estourar nas 3 × N combinações. Canário: `CURRENCIES.length >= 4` |

A escolha de **cinco dígitos** na prova de moeda é cicatriz de teste vazio
(`src/i18n/i18n.test.ts:127-131`): "o espanhol da Espanha não agrupa milhar abaixo de
dez mil, então `1234,56` sai sem separador nenhum e as duas escritas só se separam
a partir de `12.345,67`. **Uma asserção com quatro dígitos passaria a dizer que o
formato não muda** — que é o contrário do que este teste existe para provar."

#### 24.8.2 `src/notify/phrase.test.ts` — 3 testes, 96 linhas

**Regra: nenhuma notificação leva um buraco para a tela de bloqueio.** Técnica T1
sobre os três dicionários.

Um exemplo por tipo de alerta (`src/notify/phrase.test.ts:13-32`):
`insumo` (amount 2), `pedido` (amount 300, places 2), `volume` (amount 12, band
`vermelho`), `validade` (amount 3, subject `20260903-01`), `ambiente` (amount −8.4,
unit `C`, quantity `temperature`).

- `no notification ever ships a hole to the lock screen` (`:34`): para os **três**
  idiomas × os **cinco** tipos, título e corpo não casam `/\{\{/` e não são vazios.
  "`{{subject}}` na tela de bloqueio é um defeito que nenhuma outra rede pega:
  notificação não se lê num teste de navegador, e o tipo não sabe se a chave da
  frase tem o mesmo buraco que os valores preenchem."
- `each alert carries the number in the unit that alert measures` (`:50`): insumo e
  validade em **dias** ("'acaba em 2' sem unidade não decide nada"); pedido em
  **lojas** no título (`/2 lojas/`) e a quantidade no corpo — correção do dono:
  "'faltam 300' não diz se é um telefonema ou quatro"; volume em **porcentagem** com
  o assunto no título (`/Palito em 12%/`) porque "a notificação é lida de relance,
  então o que decide vem primeiro"; e grandeza física guarda a **fração**
  (`/-8,4 °C|-8\.4 °C/`) — "meio grau de freezer é diferença real".
- `one alert kind cannot be added without its words in three languages` (`:73`):
  cada `AlertKind` tem `alertText[kind].title` e `.body` nos três; e todo
  `BRIEFING_WIDGETS` tem nome nos três. "O `Widen<T>` obriga a CHAVE a existir; ele
  não obriga um tipo novo de alarme a ter chave nenhuma. Este caso fecha essa
  fresta: um `AlertKind` novo sem frase reprova aqui em vez de sair silencioso na
  bandeja."

#### 24.8.3 `src/notify/facts.test.ts` — 3 testes, 206 linhas

**Regra: os fatos que alimentam o alarme, contra um banco de verdade.** Técnica T2.

**Por que T2 e não um dublê** (`src/notify/facts.test.ts:6-18`): "existe por um
defeito que eu escrevi e que só apareceu relendo o próprio código:
**`placeId: d.itemId`**. A demanda vem agrupada por ITEM e o aviso conta LOJAS —
com o id do item no lugar do id da loja, quatro sabores pedidos pela mesma loja
viravam 'quatro lojas esperando'. O tipo não reclamou porque os dois são `string`,
e nenhuma tela mostrava esse número: só a notificação, que ninguém consegue ler
numa suíte. **A lição: onde dois ids do mesmo tipo se cruzam, o compilador não
ajuda, e é aí que o teste tem de ser contra dado real — um dublê teria concordado
com o defeito.**"

- `the order alert counts stores, not flavours` (`:57`): dois pedidos da **mesma**
  loja dão `size 1` no conjunto de `placeId`, e o id é o da **loja**; outra loja
  pedindo o mesmo produto dá 2.
- `a reading with no range is a fact without a judgement` (`:100`): sem faixa
  cadastrada, `min` e `max` são `null` e `place` traz o nome do lugar "para a frase
  existir"; depois de `savePlace` com `sensorRanges: { temperature: { min: −22,
  max: −16, unit: 'C' } }`, o mesmo fato passa a ter julgamento — "e é o alarme que
  decide, não esta camada".
- `the full cold room alarms too, not only the empty storeroom` (`:135`): com
  `fullLevel: 100` no produto, o produto **acabado** entra em `facts.volumes`; sem
  nada produzido `onHand: 0` ("zerado é faixa própria: acabou é outro fato, não
  'vermelho extremo'"); com 300 produzidos a faixa é azul, e por padrão **não**
  notifica, mas com `notifyFull: true` sim. A razão é decisão do dono
  (`src/notify/facts.test.ts:141-145`): "a faixa azul — '80 a 100%' — é sobre a
  CÂMARA CHEIA de produto acabado: quem enche a câmara para de produzir por falta
  de espaço, e isso não aparece olhando insumo. **A primeira versão dos fatos
  filtrava insumo e embalagem, copiando o recorte do cartão de dinheiro parado, que
  é outra pergunta.**"

#### 24.8.4 `src/weather/weather.test.ts` — 11 testes, 210 linhas

**Regra: o clima é a única coisa do app que depende de rede, e as três regras que
decidem se o cartão ajuda ou atrapalha** (`src/weather/weather.test.ts:14-20`): "não
desenhar dado vencido, não pedir o que o fuso já diz, e nunca deixar a falta de
internet virar tela quebrada."

Técnica T1 nas cinco primeiras, T5 nas cinco últimas — com um "aparelho de
mentira" (`src/weather/weather.test.ts:126-154`) cujas dependências são
`fetchJson` (que registra as URLs chamadas), `now` fixo em
`'2026-09-02T12:00:00Z'`, `timeZone: 'America/Sao_Paulo'`, e leitura/escrita de
lugar e cache em memória.

| teste | linha | regra presa |
|---|---|---|
| `the phone already knows the city, so nobody is asked for it` | 44 | `cityFromTimeZone('America/Sao_Paulo') = 'Sao Paulo'`; `'America/Argentina/Buenos_Aires'` = `'Buenos Aires'`; `'Europe/Madrid'` = `'Madrid'`; **`'UTC'` e `'Etc/GMT-3'` → `null`** — "procurar 'GMT-3' no geocoder acha qualquer coisa, e uma cidade errada gravada calada é pior que cartão nenhum" |
| `a day without a temperature is dropped, never zeroed` | 56 | dia com máxima `null` é **descartado**, não zerado — "zero grau em setembro não é dado faltando, é dado errado, e o cartão o desenharia com a mesma confiança dos outros"; sem chance de chuva na resposta, `rainChance: null`; `{}` e `null` dão `[]` |
| `a place without coordinates is not a place` | 79 | lugar sem lat/long é descartado; `region` sobrevive porque "duas Santa Maria existem" |
| `the difference said is the subtraction of the numbers shown` | 91 | 30,6 e 32,4 aparecem como 31 e 32, e `warmerBy = 1`, **não 2**. "A diferença crua é 1,8, que arredonda para 2 — e a tela mostraria '31, amanhã 2° mais quente, 32'. O grau dito tem que sair dos graus mostrados" |
| `a forecast that is entirely in the past draws nothing` | 102 | previsão de anteontem devolve `null`. "É a mesma doença do saldo congelado: o número está ali, com a confiança de sempre, e não é mais verdade". E sem amanhã na lista, `tomorrow: null` e `warmerBy: null` — "sem comparação inventada" |
| `freshness is measured from when the phone asked` | 115 | 2 h é fresco, 4 h é vencido; **e idade negativa é vencida** — "relógio do aparelho andou para trás (fuso, viagem, ajuste manual): uma idade negativa não é 'fresquíssima', é motivo para perguntar de novo" |
| `a fresh answer on the phone never touches the network` | 156 | zero chamadas. "Perguntar de novo a cada abertura gasta a bateria de quem trabalha" |
| `no network means the last answer, not an empty screen` | 163 | tentou uma vez e devolveu o cache antigo |
| `nothing on the phone and nothing on the network is a card that does not exist` | 171 | `null` |
| `the city is deduced once and then it is on the screen to be corrected` | 176 | duas chamadas na ordem geocoder → previsão; o lugar é gravado; a segunda abertura não chama nada |
| `changing the city throws away the other city answer` | 196 | cache de outro lugar **não é cache**: refaz a chamada. "Trocar a cidade e ver a máxima da cidade anterior por três horas é o tipo de erro que faz alguém desligar a informação inteira" |

---

### 24.9 `src/assistant/assistant.test.ts` — 34 testes, 789 linhas

**As duas promessas que tornam o assistente seguro** (`src/assistant/assistant.test.ts:18-23`):
"o assistente é a parte deste app mais capaz de destruir confiança, porque fala em
frases e frases soam certas. Estes testes o mantêm nas duas promessas que o tornam
seguro: **ele nunca inventa uma cifra, e nunca escreve nada que uma pessoa não
confirmou.**"

Técnica T5: um `AssistantData` inteiramente de dublê
(`src/assistant/assistant.test.ts:225-262`) em que `recordPurchase`, `saveItem`,
`recordProduction`, `recordTransfer` e `recordCount` **apenas empurram o input
para um array `recorded`** — "grava o que o assistente tentou fazer, para que uma
escrita silenciosa não possa se esconder" (`src/assistant/assistant.test.ts:188`).
O contexto é `{ data, capabilities: new Set(...), locale: defaultLocale }`
(`src/assistant/assistant.test.ts:264-268`), então **a permissão é o parâmetro do
teste**.

**A fixação tem uma invariante que já foi violada** (`src/assistant/assistant.test.ts:138-147`):
"as duas somas TÊM de fechar: 44.000 no almoxarifado mais 6.000 na loja são os
50.000 que `ITEMS` diz que a empresa tem. **Antes eram 50.000 + 6.000 contra um
total de 50.000 — um mundo impossível, e foi ele que deixou a contagem falada
comparar o total da empresa com a prateleira de uma sala sem nenhum teste
reclamar.**"

E o dublê de produção é indexado por **ordem de chamada**, não por data
(`src/assistant/assistant.test.ts:191-201`): "a primeira versão indexava por 'hoje
em UTC' e a habilidade pergunta pela janela do fuso da FÁBRICA — para São Paulo o
dia começa às 03:00Z do dia anterior, então as duas datas só coincidem em parte do
dia. **O teste passava pelo horário em que rodava**, que é o defeito que o guarda
do relógio existe para pegar."

#### Número e permissão

| teste | linha | regra presa |
|---|---|---|
| `the number in the answer is the one the engine computed` | 270 | `R$ 0,55` — 18.000×1,24 + 6.000×0,472 = 25.152 centavos em 38.000 ml = 0,6619/ml × 75 = 50 de massa + 5 de embalagem; `detail` traz a linha "Massa"; rota `/recipes/popsicle` |
| `a role without view_cost cannot get a figure out of it` | 280 | a resposta casa `/acesso/`, `detail` é `undefined`, e **`doesNotMatch(answer.text, /\d/)`** — "não 'a resposta foi escondida': nenhuma cifra foi jamais computada para esconder" |
| `the shopping list is a decision about buying, not something the borrowed phone sees` | 380 | `/não faz parte do seu acesso/i`, e nenhuma quantidade sai junto com a recusa. "A recusa é dita ANTES da consulta: não existe número na resposta para vazar, que é a fundação de permissão deste projeto em uma linha" |
| `how much is there is not a secret; what it is worth is` | 415 | um `operator` recebe `50.000 g` e **não** recebe a linha "Valor parado" |
| `what a place is worth is a figure, and figures obey the role` | 655 | o dono recebe "Valor parado"; o operador recebe as quantidades e nenhum dinheiro |
| `who cannot see cost cannot ask what was lost` | 784 | sem `view_cost`, nenhum `R$` na resposta |
| `counting is refused to a role that may not adjust stock` | 478 | sem `adjust_stock`, nenhum rascunho e nada gravado |
| `creating an input is a manage_company act, not something an operator does` | 619 | sem `manage_company`, nenhum rascunho |
| `producing and dispatching are each their own permission` | 743 | `record_production` não deixa despachar e `dispatch` não deixa produzir |

#### Rascunho, nunca escrita

| teste | linha | regra presa |
|---|---|---|
| `registering by talking produces a draft, never a write` | 289 | `recorded.length === 0` antes do `apply()`; depois, exatamente `{ itemId: 'pulp', purchaseQuantity: 4, baseUnits: 40_000, totalCents: fromDecimal(496), assistantPhrase: 'comprei 4 baldes de polpa de morango por 496' }`. A frase viaja "porque 'o que o assistente lançou este mês?' tem de ser respondível, e um movimento que não pode dizer de onde veio torna a autonomia não auditável" |
| `counting by talking fills a form and stops, whatever the difference` | 428 | resumo diz `/40.000 g de Polpa de morango/` e `/Bate com o que o sistema esperava/`; com 3 baldes, `/Estão faltando 10.000 g/` e `/nada é apagado/`; e o `apply()` grava `{ itemId, countedBaseUnits: 30_000, assistantPhrase }` |
| `an item split between two rooms is not counted by talking, it is located` | 458 | **nenhum rascunho**: a resposta diz `/2 lugares/`, nomeia "Fábrica" e "Loja Centro", e a rota é `/inputs/sugar` — "a tela que sabe perguntar qual sala". "Com 44.000 na fábrica e 6.000 na loja, contar a prateleira da fábrica 'encontrava' uma falta de 6.000 g que não existe" |
| `an input can be created by talking, and the package is read not asked` | 578 | grava `{ kind:'input', name:'polpa de açaí', purchaseUnit:'balde 10 kg', purchaseToBase: 10_000, baseUnit:'g' }` |
| `a package with no size still creates the item, and says so` | 594 | diz `/não consegui ler o tamanho/i` e grava `purchaseToBase: null`. "Honesto em vez de esperto: um insumo nomeado sem fator é útil, e adivinhar um número que fica debaixo de todo custo daquele item não é" |
| `creating something that already exists points at it instead` | 607 | nenhum rascunho, `/já está cadastrado/` |
| `producing by talking counts the inputs by what came out, and says so` | 675 | sem tacho dito, a resposta diz `/pelo que saiu/` **e o que ela grava é o que ela disse**: `batches < 1` e `batches === 480/506` (um tacho põe 506 unidades: 40.000 ml − 5% ÷ 75 ml). Dito explicitamente ("em 2 tachos"), obedece à letra e grava `batches: 2` |
| `a load is refused before it is prepared, never after it is trusted` | 714 | mais do que a fábrica tem: **nenhum rascunho**, e `/Tem só 44.000 g/`; lugar inexistente aponta para `/places`; o caso bom grava `{ itemId, toLocationId:'centro', baseUnits: 6000, assistantPhrase }` e o resumo diz `/transferência, não venda/` |
| `asking to erase gets directions, never an erasure` | 389 | `/Ajustes/`, rota `/settings`, `draft: undefined`. "A habilidade não tem como agir: devolve palavras e uma rota, e nada mais" |

**A cicatriz do consumo proporcional** (`src/assistant/assistant.test.ts:685-693`): "a
frase 'pelo que saiu' já estava sob teste; **o número que ela promete não estava**,
e trocar o consumo proporcional por um tacho fixo passou pela suíte inteira sem
uma falha. 480 é menos de um tacho, e debitar um inteiro é polpa que some do papel
sem sair da prateleira."

#### Lei 3, Lei 5, Lei 7 no assistente

| teste | linha | regra presa |
|---|---|---|
| `"nothing changed" is said plainly instead of dressed up as an alert` | 313 | `/estável/`, sem `detail` |
| `what moved is ranked by how much it moved` | 321 | `/subiu 7,8%/` e `detail.length === 1` — "um preço inalterado não é uma mudança" |
| `a question it cannot answer offers what it does know` | 329 | `/ainda não sei/i` e uma **`list`**, não `detail`: "a frase termina em dois-pontos prometendo os exemplos, e a tela mostra `detail` atrás de um botão escrito 'POR QUÊ?'. Nenhuma dessas linhas é a conta de número nenhum" |
| `the examples offered never include skills the role cannot use` | 340 | os exemplos oferecidos a um operador não mencionam `custa` nem `preço`. Com o canário antes: "senão a asserção de baixo passa com a lista vazia — que é exatamente o que aconteceu quando os exemplos mudaram de campo" |
| `it lists what is in the storeroom, with the money that is sitting there` | 350 | `/2 itens/`, `R$ 732,00` (496 + 236), rota `/inputs`, `detail.length === 2` |
| `it turns a plan into a shopping list, said as what is missing` | 361 | 1 tacho: `/não falta nada/i`; 3 tachos: `/faltam 1 insumo/`, rota `/purchase`, e `/faltam 14.000 g/` **com a conta aberta** `/precisa 54.000, tem 40.000/` (Lei 6) |
| `it says how much is there, and when anyone last checked` | 398 | `/50.000 g/` **e** `/conferido em 20\/08/`. "Lei 3: o saldo nunca aparece sozinho. A data em que foi verificado é o que transforma um número guardado num que alguém ficou na frente" |
| `a shelf nobody has ever counted says so, instead of sounding certain` | 409 | `/Ninguém conferiu a prateleira ainda/` |
| `the assistant answers what the briefing shows, and says when there is nothing` | 526 | vazio → `/Nada saiu do tacho hoje/`; com 480 hoje e 300 na semana passada → `/480/` **e** `/180 a mais que no mesmo dia da semana passada/`. "A capa passou a dizer o que saiu do tacho hoje, e o assistente respondia 'ainda não sei'. Duas verdades no mesmo app, e quem perde é o assistente: a pessoa pergunta uma vez, ouve que ele não sabe, e não pergunta de novo" |
| `what was lost names the reason that dominates, not the biggest single loss` | 761 | `R$ 100,00` e `/vencida/`, **e não** `/derretida/`. "Uma caixa derretida de 40 reais contra três vencimentos de 20: o maior prejuízo isolado é o freezer, mas o que come o mês é a validade. A pergunta que o dono faz é onde o dinheiro está indo, então a resposta soma por motivo antes de eleger o pior" |
| `nothing lost is an answer, and it does not invent an alert` | 777 | `/Nenhuma perda/` e nenhum `R$` |
| `a place is asked about by name, and the unnamed default answers to "fábrica"` | 627 | "Loja Centro" com `6.000 g`; o lugar padrão tem nome **vazio** no banco e a habilidade o chama de "fábrica"; a fábrica responde **44.000** e não os 50.000 da empresa; e `'quanto tem na loja centro'` — que também casaria com `stockOfInput` e leria "na loja centro" como nome de insumo — é atendido pelo lugar: "a ordem do registro é semântica, e é esta linha que a segura"; lugar inexistente diz `/Não encontrei um lugar chamado "loja norte"/` |
| `where a thing is reads the same sum from the other side` | 664 | `detail` é exatamente `[{ label:'Fábrica', value:'44.000 g' }, { label:'Loja Centro', value:'6.000 g' }]` |

#### Busca por nome e leitura de número

- `it finds the item by the word people actually type` (`:487`):
  `findByName(ITEMS,'morango')` → `pulp`; **`'acucar'` → `sugar`** ("acento não
  pode importar"); `'AÇÚCAR CRISTAL'` → `sugar`; `'parafuso'` → `null`.
- `a word that reaches the whole grid elects nobody` (`:511`):
  `findByName([{Pote 1 litro de morango},{Picolé Tradicional de morango}],'morango')`
  = **`null`**, e `namesakes(...)` devolve os dois na ordem; e casar exato continua
  ganhando. A razão (`:492-509`): "antes da linha × tipo × sabor, 'morango' batia
  num produto só e devolver o nome mais curto passava por esperto. Com a grade,
  'morango' alcança doze, e o mais curto é sorteio: 'Pote 1 litro de morango' ganha
  de 'Picolé Tradicional de morango' por ter menos letras, e a produção seria
  gravada contra a receita errada sem uma palavra a ninguém. **Trocar o `null` de
  volta pelo mais curto passou por noventa e dois testes verdes.** O empate é a
  única saída do assistente que decide calada." E é Lei 5: o erro impede **e** diz
  o caminho — devolve os nomes para a tela perguntar qual.
- `it reads a number however it was typed` (`:541`): `'1.250,40'` e `'1250.40'` →
  1250,4; `'R$ 496'` → 496; `'abc'` → `null`; **e os quatro que divergiam das
  telas**: `'1.500'` → 1500 ("mil e quinhentos picolés"), `'6.000'` → 6000 ("seis
  mil gramas"), `'46.000'` → 46000, `'0.500'` → 0,5. "Nada nesta suíte tocava esse
  ramo: o assistente lia '1.500 picolés' como um e meio, e 'mandei 6.000 gramas'
  como seis gramas."

---

### 24.10 Os padrões de teste que este repositório usa de propósito

Sete formas recorrem em toda a suíte. Cada uma nasceu de um teste que passou pelo
motivo errado, e reconhecê-las é o que permite reconstruir a suíte sem reaprender
os mesmos custos.

**P1 — O canário anti-vacuidade.** Antes de qualquer comparação, uma asserção de
que o sujeito não está vazio. Sem ele, "nenhum violador encontrado" é verdade de
graça num conjunto vazio. Exemplos, com o texto real:

- `assert.ok(withSql.length >= 3, …)` — "uma regra que passaria num repositório
  vazio não prova nada" (`src/layers.test.ts:91-97`)
- `assert.ok(fontes.length > 20, 'a varredura de fontes veio vazia — a comparação seria de graça')`
  (`src/layers.test.ts:258`, `src/layers.test.ts:504`)
- `assert.ok(telas.length > 10, …)` (`src/layers.test.ts:324`, `src/layers.test.ts:433`)
- `assert.ok(noSql.length > 0, 'nenhuma consulta filtra por tipo de lugar — a comparação seria de graça')`
  (`src/layers.test.ts:390`)
- `assert.ok(secoes.length > 5, 'o dicionário chegou vazio')` (`src/dictionary.test.ts:64`)
- `assert.ok(LITERAIS.length > 20, 'o extrator de seletores parou de achar seletores')`
  (`src/selectors.test.ts:109`) e `EXPRESSOES.length > 5` (`src/selectors.test.ts:127`)
- `assert.ok(GARANTIAS > 5, …)` (`src/bar.test.ts:76`), `TABELA.length > 5` (`src/bar.test.ts:154`)
- `assert.ok(todas.length >= 4, 'a leitura das paletas veio com N — a comparação seria de graça')`
  (`src/theme/contrast.test.ts:68`)
- `assert.ok(base.size > 300, 'o dicionário encolheu para N frases - este teste passaria à toa')`
  (`src/i18n/i18n.test.ts:40`)
- `assert.ok(files.length >= 8, 'the migrations went missing, and this file would pass anyway')`
  (`src/sync/agreement.test.ts:38`), `tables.size >= 10` (`src/sync/agreement.test.ts:113`),
  `fields.length > 8` (`src/sync/agreement.test.ts:338`), `columns.size > 8`
  (`src/sync/agreement.test.ts:375`), `written.length >= 2`
  (`src/sync/agreement.test.ts:157`), `device.length >= 4` (`src/sync/agreement.test.ts:204`)
- `assert.ok(NO_APARELHO.length > 15, …)` (`src/data/erase.test.ts:93-95`),
  `DEPENDE_DE.size > 15` (`src/data/erase.test.ts:120`), `filhosDeItem.length > 3`
  (`src/data/erase.test.ts:165`)
- `assert.ok(noCodigo.length > 10, 'a leitura do repositório veio vazia')`
  (`src/data/outbox.test.ts:36`), `criadas.size > 15` (`src/data/outbox.test.ts:60`)
- `assert.ok(plano.length > 0, 'o plano veio vazio — a comparação abaixo seria de graça')`
  (`src/data/db.test.ts:144`)
- `assert.ok(linhas.length > 0, 'there is something to offer')` — e a nota:
  "a contagem primeiro, senão a asserção de baixo passa com a lista vazia — que é
  exatamente o que aconteceu quando os exemplos mudaram de campo"
  (`src/assistant/assistant.test.ts:345-346`)
- `assert.ok(product.unitPackagingCents > 0, 'the seeded product has packaging, or this proves nothing')`
  (`src/data/repository.test.ts:2052`)
- `assert.ok(enfileiradas.size > 5, 'a varredura não achou os enqueue do repositório')`
  (`src/sync/agreement.test.ts:416`)

O caso extremo é `src/selectors.test.ts:47-52`, que **lança na carga do módulo** se
o dicionário vier com menos de 100 frases, porque uma guarda que reprova pelo
motivo errado "manda consertar o lugar errado".

**P2 — Registro escrito em vez de heurística.** Quando existem exceções legítimas,
elas são uma tabela com **motivo escrito** e comprimento mínimo, e um segundo
teste garante que a tabela não sobrevive ao problema. Cinco instâncias:

| registro | arquivo | mínimo do motivo | teste de podridão |
|---|---|---|---|
| `TELAS` | `src/law.test.ts:45` | 40 caracteres | `the registry does not outlive the screens` (`:166`) |
| `ESCRITAS_ADIANTADO` | `src/dictionary.test.ts:41` | 40 | `the frontier list only holds sections that are still unread` (`:80`) |
| `NAO_E_DICIONARIO` | `src/selectors.test.ts:74` | 20 | `the exceptions list only holds exceptions that are still used` (`:142`) |
| `TINTA_PROPRIA` / `DELEGAM` / `FALTAM` | `src/language.test.ts:66` / `:39` / `:55` | 40 | `the pending list only shrinks, and never outlives the screens` (`:133`) |
| `FICA_DE_PROPOSITO` | `src/data/erase.test.ts:87` | 40 | `the deliberate leftovers list only holds tables that still exist` (`:112`) |
| `SO_DO_APARELHO` | `src/sync/columns.test.ts:26` | — | (sem teste de podridão) |
| `known = ['recorded_by']` | `src/sync/agreement.test.ts:383` | — | dentro do próprio teste: `stale` reprova (`:395-396`) |

A razão está escrita em dois lugares e é a mesma: "sem a lista, a guarda ficaria
vermelha por desenho e alguém a desligaria — que é como uma guarda morre"
(`src/data/erase.test.ts:84-85`); "a próxima seção escrita adiantada precisa dizer
para quem, ou não entra" (`src/dictionary.test.ts:38-39`).

**P3 — A régua morde a cicatriz.** Toda guarda de `grep` tem um teste que a
alimenta com a linha exata que existia no repositório e exige reprovação, **e**
com o conserto e exige aprovação. Cinco pares em `layers.test.ts`
(`:210`, `:341`, `:450`, `:521`, `:115`), um em `schema.test.ts:62` ("uma guarda que
ninguém viu morder não é uma guarda. Este é o nome real da coluna real que
realmente existiu"), um em `contrast.test.ts:92` ("a régua conferida com dois casos
que não dependem de nenhuma paleta"). O caso que justifica o padrão inteiro é o
do acento em `layers.test.ts:139-145`: a régua original "passaria verde na própria
cicatriz que ela cita, o que é pior que não existir: ela anunciaria uma proteção
que não estava lá."

**P4 — Literal em vez da própria constante.** `src/domain/qr.test.ts:56-64` escreve
`assert.equal(span, 29)` em vez de `21 + QUIET_ZONE * 2`, porque "com isso os dois
lados da igualdade mudavam juntos, e o teste não tinha como falhar. A mutação que
zerava a margem passou por ele sem encostar." O mesmo raciocínio aparece invertido
em `src/bar.test.ts`, onde o **documento** é o lado literal e o sistema é o lado
derivado.

**P5 — Fixação com valor diferente de zero.** `src/data/erase.test.ts:249-255`:
`movements` entrou como `0` e "zero faz a asserção passar com ou sem o campo sendo
carregado — a mutação que tirava `movements` de `tallyFor('purchases')` atravessou
a suíte por causa desta linha". Hoje é 412. Duas outras instâncias:
`src/domain/picking.test.ts:6-8` ("as duas fontes DISCORDANDO é o único caso que
prova a ordem: com uma delas vazia, qualquer ordem dá o mesmo número — e um teste
assim passa por acidente. Foi exatamente assim que este mutante sobreviveu duas
vezes"), e `src/i18n/i18n.test.ts:127-131` (quatro dígitos passariam a afirmar o
contrário do que o teste existe para provar).

**P6 — Ler o gravado, não o retornado.** `src/data/repository.test.ts:1113-1127`: a
asserção sobre o objeto de retorno de `openProductionRun` passava enquanto a
mutação trocava o parâmetro do `INSERT`, "porque o retorno é montado à parte". A
segunda asserção lê `openProductionRuns()` de volta. O mesmo padrão em
`src/data/repository.test.ts:2540-2565` (o `unit_cost_rate` é lido da linha de
`movements`, não do retorno) e em `src/data/repository.test.ts:1592-1620` (o
`expires_on` é lido da tabela `lots`).

**P7 — Perguntar ao sistema em vez de à lembrança de quem escreveu.** A lição
mais caras do repositório, e ela tem nome: `src/data/erase.test.ts:24-42` (mapa à
mão conferido contra o union com os mesmos membros — "a lista conferida contra si
mesma", nove tabelas invisíveis por construção),
`src/data/outbox.test.ts:21-24` ("as duas são pegas lendo o sistema em vez de
comparar esta lista com ela mesma"), `src/layers.test.ts:41-48` (pastas descobertas
em vez de listadas), `src/sync/columns.test.ts:99-101` (chamar o `build` em vez de
transcrevê-lo), `src/sync/agreement.test.ts:152-154` e `:199-202` (os tipos de
movimento e as razões de perda são **lidos** do código, "para um tipo acrescentado
amanhã ser conferido sem ninguém lembrar de atualizar este teste"),
`src/bar.test.ts:23-28` ("uma guarda que compara duas coisas escritas pela mesma
mão não guarda nada, e a pergunta certa é de onde vem o outro lado da
comparação"). O `src/theme/contrast.test.ts:19-23` é a variante estética: ler o
arquivo em vez de importar os tokens, senão "o teste passaria a medir o que a
herança produziu, não o que está escrito".

---

### 24.11 O que os testes NÃO garantem — lista honesta

Esta seção é a mais importante para quem reconstrói. Tudo abaixo foi verificado
por inspeção ou execução, não suposto.

#### 24.11.1 Nada de React é renderizado

**NÃO COBERTO.** Não existe nenhum arquivo `*.test.tsx` no repositório (verificado:
`find . -name '*.test.tsx'` não retorna nada), e nenhuma biblioteca de renderização
em `package.json`. Consequências diretas:

- Os **26 arquivos de tela** em `app/` não têm teste de unidade nenhum. Toda
  garantia sobre elas é indireta: `law.test.ts`, `language.test.ts`,
  `layers.test.ts`, `confirm.test.ts` e `selectors.test.ts` afirmam propriedades do
  **texto-fonte** delas; o e2e as dirige num navegador.
- Os **28 componentes** de `src/components/` (`Alive`, `Bars`, `Button`, `Card`,
  `Chip`, `CollapsingHeader`, `Confirm`, `CountUp`, `Crash`, `Drain`,
  `FactoryScene`, `Field`, `Glyph`, `icons`, `Landscape`, `ListRow`, `Mark`,
  `PulseDot`, `QrCode`, `Reveal`, `Sky`, `Sparkline`, `Touchable`, `UnitStepper`,
  `WhatsNew`, `WhySheet`) não têm nenhum teste. Do `Sparkline` só a matemática é
  testada (`src/domain/spark.test.ts`); do `QrCode` só o mapa de módulos
  (`src/domain/qr.test.ts`).
- `src/home/Mosaic.tsx`, `src/home/Peca.tsx` e `src/home/types.ts`: nenhum teste
  direto. `Mosaic.tsx` é a tela mais medida do repositório por guarda de fonte (dez
  declarações em `law.test.ts`) e a menos testada por execução.
- `src/theme/ThemeProvider.tsx` e `src/theme/Appearance.tsx`: **NÃO COBERTOS**. A
  regra que morava dentro do `ThemeProvider` foi *extraída* para `scheme.ts`
  exatamente porque "só o navegador a alcançava e a suíte de mutação roda a
  unidade" (`src/theme/scheme.test.ts:8-11`) — o que sobrou no Provider continua
  sem teste.
- `src/i18n/Locale.tsx`, `src/i18n/useLocale.ts`, `src/i18n/device.ts`,
  `src/notify/Alerts.tsx`, `src/data/useQuery.ts`: **NÃO COBERTOS**.

#### 24.11.2 Postgres, RLS e o servidor de verdade

**NÃO COBERTO por `npm test`.** Toda a suíte usa `node:sqlite` em memória. Nada em
`*.test.ts` executa uma migração de `supabase/migrations/`, nenhum gatilho de
Postgres dispara, nenhuma política de RLS é avaliada. O que existe é **acordo
estático**: `src/sync/agreement.test.ts` **lê** o SQL das 32 migrações com
expressões regulares e compara nomes de coluna, valores de enum e obrigatoriedade
— e o próprio arquivo diz "não pode provar comportamento; pode provar acordo"
(`src/sync/agreement.test.ts:18-19`).

A prova executável está em `npm run db:verify` (`scripts/verify-migrations.sh`),
fora da suíte, com **13** garantias contra um Postgres descartável:

1. o livro-razão recusa UPDATE e DELETE
2. uma compra move a média móvel, mantendo precisão
3. um produto não pode ser meio-fabricado
4. uma empresa não pode ver outra, e um operador não pode ver dinheiro
5. o livro-razão aceita o que a fase 1 realmente registra
6. a fila do aparelho chega inteira, e os dois lados fecham o mesmo número
7. a grade do produto recusa o cadastro impossível
8. o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova
9. o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu
10. o razão recusa item e local de outra empresa
11. o aparelho emprestado cria o lugar padrão, e nada além dele
12. a leitura da câmara sobe duas vezes, e a segunda não reescreve nada
13. quem aprova um pedido não reescreve quem o anotou

#### 24.11.3 O que só o navegador prova

**NÃO COBERTO por `npm test`.** Três defeitos passaram por toda a bateria unitária
e só apareceram com o app aberto: "uma confirmação que não existe na web, rotas que
abriam num banco vazio, e uma tela falando dois idiomas". `npm run e2e:fast` roda
**36** checagens (`grep -c '^check(' e2e/flow.mjs`) num navegador de verdade. A
suíte unitária cobre pedaços dessas checagens de dois jeitos indiretos e nenhum
deles é execução: `confirm.test.ts` proíbe o `Alert`, e `selectors.test.ts` garante
que os textos que o e2e procura existem.

#### 24.11.4 O que a suíte verde não diz sobre a suíte

**A própria suíte não mede se morde.** `npm run mutate` (`scripts/mutate.mjs`)
planta **106** defeitos e o plano registra 104 pegos e 2 equivalentes
(`docs/roadmap.md:46`). A distribuição dos alvos é desigual e a lista revela onde a
confiança é medida e onde é presumida:

| arquivo mutado | mutações |
|---|---|
| `src/data/repository.ts` | 40 |
| `src/assistant/skills.ts` | 10 |
| `src/domain/recipe.ts` | 6 |
| `src/domain/money.ts`, `src/domain/alerts.ts` | 4 cada |
| `src/domain/cost.ts`, `src/data/erase.ts` | 3 cada |
| `src/theme/scheme.ts`, `src/sync/serialize.ts`, `src/i18n/locales/pt-BR.ts`, `src/i18n/company.ts`, `src/domain/qr.ts`, `src/domain/picking.ts`, `src/domain/measure.ts`, `src/domain/day.ts`, `src/domain/briefing.ts`, `src/domain/agreement.ts` | 2 cada |
| `src/theme/tokens.ts`, `src/notify/phrase.ts`, `src/notify/facts.ts`, `src/i18n/index.ts`, `src/domain/units.ts`, `src/domain/lot.ts`, `src/domain/ledger.ts`, `src/domain/access.ts`, `src/data/seed.ts`, `src/data/db.ts`, `src/assistant/text.ts`, `src/assistant/index.ts`, `app/purchase.tsx`, `app/production/new.tsx`, `app/inputs/[id].tsx`, `app/(tabs)/index.tsx` | 1 cada |

Nenhuma mutação atinge `src/domain/number.ts`, `src/domain/spark.ts`,
`src/sync/engine.ts`, `src/data/outbox.ts`, `src/data/simulate.ts`,
`src/weather/index.ts` nem `src/weather/live.ts` — os testes desses módulos
existem e **não foram exercitados contra código quebrado de propósito**.

Cinco mutações que **atravessaram a suíte** estão documentadas nos próprios
arquivos de teste, e são a medida mais honesta do que "verde" significou:

| mutação sobrevivente | o que ela fazia | quem a pegou depois |
|---|---|---|
| `Math.round` → `Math.floor` em `amountOf` | perdia fração de centavo, sempre para baixo | `src/domain/money.test.ts` (92 testes verdes antes) |
| `blendRate` → `return arriving.rate` | o estoque antigo passava a valer o preço de hoje | `src/domain/cost.test.ts:81` |
| `itemsRate` zerado em `costPerProductUnit` | a embalagem saía do custo cotado por sete telas | `src/domain/recipe.test.ts:174` |
| `MissingRecipeError` → custo zero | todo sabor apoiado numa base ausente ficava mais barato | `src/domain/recipe.test.ts:471` |
| `NAO_ESTORNADO` removido de `productionOn` | a capa dizia que a fábrica produziu o que foi desfeito | `src/data/repository.test.ts:3096` |
| `QUIET_ZONE` zerado | o QR perdia a margem branca | `src/domain/qr.test.ts:53` (depois de o literal substituir a constante) |
| consumo proporcional → tacho fixo no assistente | debitava polpa que ninguém declarou | `src/assistant/assistant.test.ts:685` |
| `findByName` empate → nome mais curto | gravava produção contra a receita errada | `src/assistant/assistant.test.ts:511` |
| `recipe_version_id` ← `product.recipeId` | uuid legítimo na coluna errada | `src/data/repository.test.ts:1122` |
| `movements` fora de `tallyFor('purchases')` | a confirmação de apagar mentia o número | `src/data/erase.test.ts:248` |

E há um período nomeado em que o portão não olhava nada
(`src/domain/cost.test.ts:78-79`): "**por 66 commits o portão declarou todo defeito
'pego' sem consultar nada.**"

#### 24.11.5 Lacunas nomeadas dentro dos próprios testes

Cada uma destas está escrita no arquivo que a deixa de fora:

- **Receita apontando para um item de tipo PRODUTO.** `recipe_lines.item_id` é
  RESTRICT e `purchaseLinesUsingProducts` não conta esse caso; "apagar produtos"
  poderia levantar `FOREIGN KEY` na tela de alguém. "É estreito e nunca aconteceu,
  e a checagem honesta dele é executável, não estática"
  (`src/data/erase.test.ts:154-159`). **NÃO COBERTO.**
- **Que a capa DESENHA o aviso de validade.** O guard prova que ela não o
  restringe a uma sala; "que ela desenha, não" (`src/layers.test.ts:253-254`).
- **Que a tela escolheu a sala CERTA numa contagem.** "Prova que ela escolheu"
  (`src/layers.test.ts:307`).
- **Que a tela mostra o texto que o e2e procura.** "Isso é trabalho do navegador"
  (`src/selectors.test.ts:23-25`).
- **Chave de dicionário órfã.** `dictionary.test.ts` mede seção, não chave; uma
  varredura por chave acusou 44 folhas sem leitor aparente, "e boa parte é falso
  positivo do detector" (`src/dictionary.test.ts:27-31`). **NÃO COBERTO.**
- **Linha nova na tabela do plano sem entrada em `TABELA`.** `bar.test.ts` "confere
  o que foi registrado, não descobre o que não foi" (`src/bar.test.ts:113-118`).
- **Um `mutate` que passasse a FALHAR.** `bar.test.ts` conta as mutações lendo o
  script; não as roda (`src/bar.test.ts:30-34`).
- **Gosto.** "Gosto não se testa, mas 'esta tela não tem desenho nenhum' se conta"
  (`src/language.test.ts:23-24`) — as três regras de `language.test.ts` são
  mecânicas de propósito e não dizem nada sobre a tela ser boa.
- **O diálogo de uma plataforma.** "Não há como testar por unidade"
  (`src/components/confirm.test.ts:16-17`).

#### 24.11.6 Ergonomia física, e o risco que o próprio plano nomeia

**NÃO COBERTO, e não é coberto por nenhuma das camadas.** O plano do mês registra
o risco por escrito: "a F3 tem ergonomia que não se verifica sem aparelho — tela
capacitiva a −18 °C, luva, QR a um braço de distância". O contraste
(`src/theme/contrast.test.ts`) e o tamanho de grade do QR (`src/domain/qr.test.ts`)
são as **proxies numéricas** que o repositório conseguiu construir para isso: 4,5:1
de WCAG e 21×21 módulos a 1,9 mm. Nenhuma delas prova legibilidade real com luva e
condensação, e o arquivo do contraste é explícito sobre a régua ser a da WCAG para
texto normal, escolhida porque "a maior fonte de corpo é 15 px".

#### 24.11.7 Coisas que a suíte deliberadamente não impede

Estas são decisões, não lacunas, e estão listadas para não serem "consertadas":

- **`item_costs` não atravessa para o servidor.** `serialize` devolve
  `{ kind: 'derived' }`, e o teste afirma a ausência
  (`src/sync/serialize.test.ts:122-129`). A média tem um autor de cada lado, e
  "mandar os dois deu à cifra dois autores e eles discordaram na primeira
  reprodução real" (`src/sync/sync.test.ts:107-110`).
- **`production_runs` nunca vai ser enviável.** "Corrida aberta é ESTADO do
  aparelho, não lançamento — o servidor não tem onde guardá-la e não deve ter"
  (`src/sync/serialize.test.ts:132-136`).
- **`app_meta` sobrevive a "apagar tudo".** Registro com motivo em
  `src/data/erase.test.ts:87-90`.
- **`recorded_by` não é guardado no aparelho.** É estampado pelo serializador a
  partir de quem sincroniza, e o servidor impõe `recorded_by = auth.uid()` —
  "nenhum valor do aparelho poderia estar certo" (`src/sync/agreement.test.ts:383-387`).
- **O `azul` não notifica por padrão.** `notifyFull: false`; "almoxarifado cheio
  depois de uma compra é estado desejado, e aviso diário sobre estado desejado é o
  alerta que ensina a ignorar alerta" (`src/domain/alerts.test.ts:100-102`).
- **`ordersNeedApproval` nasce `false`.** "A fábrica de seis pessoas entrega antes"
  (`src/data/repository.test.ts:3013`).

#### 24.11.8 Dois defeitos medidos nesta auditoria

- **`docs/roadmap.md:38` diz "capacidades: 18" e o sistema tem 12.** A derivação de
  `src/bar.test.ts:127` conta todo literal `'[a-z_]+'` em `src/domain/access.ts`,
  o que soma as 12 capacidades **mais** seis dos sete nomes de papel (`owner`,
  `operator`, `driver`, `buyer`, `customer`, `salesperson` — `storeManager` tem
  maiúscula e escapa da régua). Verificado por execução. A guarda está verde e o
  número que ela protege está errado; a linha `papéis | 7` é a que está certa.
- **`src/data/repository.test.ts:3381-3382` tem dois `console.log` de depuração**
  esquecidos no último teste, imprimindo `[dbg] lote:` e um dump de movimentos a
  cada execução da suíte. Não altera resultado; é sujeira que a barra não pega.

#### 24.11.9 O quadro final: quatro camadas, e o que cada uma alcança

| camada | comando | tamanho | alcança | não alcança |
|---|---|---|---|---|
| unidade | `npm test` | 338 testes, 9,7 s | aritmética, SQL do aparelho, forma do repositório, contratos estáticos | React, Postgres, navegador, ergonomia |
| mutação | `npm run mutate` | 106 defeitos, ~6 min | se a suíte de unidade **morde** | o que ela não muta (7 módulos com teste e zero mutações) |
| navegador | `npm run e2e:fast` | 36 checagens, ~2 min 40 | rota, render, idioma, confirmação, fluxo completo | Postgres, RLS, aparelho físico |
| servidor | `npm run db:verify` | 13 garantias, ~30 s | trigger, RLS, enum, a fila reproduzida | tela, ergonomia |

E o portão de entrega por cima das quatro: `bash .proofgate/verify.sh`, onde
"qualquer ❌ significa que não está pronto, e todo ⚠️ pede justificativa escrita".
Depois dele, o nível de evidência: **E0** acreditado → **E3** exercitado de verdade
→ **E4** visto em produção. Nesta seção, tudo o que é afirmado sobre a suíte está
em E3 (`npm test` foi executado: 338/338, 9,7 s); tudo o que é afirmado sobre
`mutate`, `e2e:fast` e `db:verify` está em **E0/E1** — lido dos scripts e do plano,
não executado nesta auditoria.
