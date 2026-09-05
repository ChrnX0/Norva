## 22. O assistente: inteligência determinística sobre o livro-razão

O assistente ocupa cinco arquivos e uma tela: `src/assistant/index.ts` (85 linhas),
`src/assistant/skills.ts` (1.100 linhas), `src/assistant/text.ts` (107 linhas),
`src/assistant/types.ts` (175 linhas), `src/assistant/assistant.test.ts` (789 linhas) e
`app/assistant.tsx` (326 linhas). O ligamento com o banco mora fora da pasta, em
`src/data/assistantData.ts` (73 linhas).

**Estado geral: implementado e chamado por tela.** A tela `/assistant` existe
(`app/assistant.tsx:63`) e tem uma porta de entrada real: o primeiro cartão da aba "Mais"
(`app/(tabs)/more.tsx:129`, `router.push('/assistant')`). As seções abaixo marcam
explicitamente as poucas peças que não têm chamador.

---

### 22.1 A decisão registrada no topo de `src/assistant/index.ts`

Este docblock é decisão do dono, não comentário de implementação — o `CLAUDE.md` cita
esse arquivo pelo nome como exemplo de fronteira registrada que já foi confundida três
vezes com defeito. Transcrição literal (`src/assistant/index.ts:7-22`, o original está em
inglês):

```
/**
 * The assistant speaks Portuguese only, and that is a boundary rather than an
 * oversight.
 *
 * The screens read every word from the dictionary and run in three languages.
 * The assistant cannot follow yet, because what it matches on is Portuguese
 * phrasing: "quanto custa", "comprei 4 sacos de". Translating the answers would
 * be half a job - the questions would still only arrive in one language, and an
 * assistant that answers in Spanish but only understands Portuguese is worse
 * than one that is honestly monolingual.
 *
 * The design already says how this ends: when a language model does the
 * matching, it maps any phrasing to a skill and its slots, and the language of
 * the question stops being the matcher's problem. The answers move to the
 * dictionary then, in the same change.
 */
```

Tradução fiel:

> O assistente fala só português, e isso é uma fronteira, não um descuido.
>
> As telas leem cada palavra do dicionário e rodam em três idiomas. O assistente ainda
> não consegue acompanhar, porque o que ele casa é fraseado em português: "quanto custa",
> "comprei 4 sacos de". Traduzir as respostas seria meio trabalho — as perguntas
> continuariam chegando num idioma só, e um assistente que responde em espanhol mas só
> entende português é pior que um que é honestamente monolíngue.
>
> O desenho já diz como isso termina: quando um modelo de linguagem fizer o casamento,
> ele mapeia qualquer fraseado para uma habilidade e seus campos, e o idioma da pergunta
> deixa de ser problema do casador. As respostas vão para o dicionário nesse momento, na
> mesma mudança.

**A condição de quando a decisão deixa de valer está no último parágrafo:** ela cai no dia
em que um modelo de linguagem fizer o *matching*. Não antes, e não em duas etapas — as
respostas migram para `src/i18n/locales/` "na mesma mudança".

Há um segundo docblock que repete a mesma decisão do lado das cinco palavras da perda
(`src/assistant/skills.ts:225-233`): *"Cravadas aqui de propósito, e a decisão está no topo
de `index.ts`: este assistente é honestamente monolíngue, porque casar frase por expressão
regular só funciona numa língua."*

E um terceiro, que faz o recorte fino da decisão (`src/assistant/text.ts:74-83`): a decisão
é sobre as **palavras** do assistente, nunca sobre os **números**. `movePhrase` formata a
porcentagem com `formatPercent(...)` e não com `toFixed().replace('.', ',')`, porque trocar
ponto por vírgula à mão *"acerta em português e erra em qualquer outro idioma — inclusive
no espanhol do México, que usa ponto"*.

#### O que o monolinguismo implica, concretamente

| Consequência | Onde se vê |
|---|---|
| Todos os `example`, `text`, `summary`, `label` e `value` das habilidades são strings literais em português dentro do código, fora do dicionário | `src/assistant/skills.ts` inteiro |
| Os cinco motivos de perda têm tradução cravada no módulo, não no dicionário | `src/assistant/skills.ts:234-240` |
| As duas frases de sistema (recusa por permissão e "ainda não sei") também são literais | `src/assistant/index.ts:66`, `79-80` |
| **A tela** do assistente, ao contrário, lê tudo do dicionário nos três idiomas | `app/assistant.tsx` usa `t.app.assistant.*` |
| Por isso a tela pode aparecer em espanhol com a resposta em português — a moldura é traduzida, o conteúdo não | `src/i18n/locales/es.ts:950-969` vs. as strings de `skills.ts` |
| A tela **força** o `locale` do assistente para `defaultLocale` (`pt-BR`, `BRL`, `America/Sao_Paulo`), ignorando o idioma escolhido, para formatar números | `app/assistant.tsx:100`; `src/i18n/index.ts:25-30` |
| O fuso, porém, **não** é forçado: `liveData` recebe `locale.timeZone` do idioma vivo | `app/assistant.tsx:98` |

Essa última linha é uma assimetria real e está no código exatamente assim: a janela do dia
("quanto saiu hoje") usa o fuso do usuário, e a formatação da resposta usa o `pt-BR` fixo.

---

### 22.2 O contrato: duas regras que moldam a pasta inteira

Transcrição de `src/assistant/types.ts:15-31` (original em inglês), traduzida:

> O assistente, como contrato.
>
> Duas regras moldam tudo nesta pasta, e as duas vêm da mesma preocupação: um número errado
> sobre dinheiro destrói a confiança para sempre, e ela nunca volta.
>
> 1. **O assistente nunca produz um número.** Ele reconhece o que foi perguntado, o motor
>    determinístico calcula, e a resposta é redigida em volta do número que o motor
>    devolveu. Quando um modelo de linguagem for acrescentado, ele mapeará fraseado para
>    uma habilidade e seus campos — nada além disso. Ele continua intérprete, nunca
>    contador.
> 2. **O assistente nunca escreve no livro-razão.** Ele preenche um rascunho em linguagem
>    simples e um humano confirma. Se entendeu errado, isso aparece antes de qualquer coisa
>    ser gravada, e não meses depois num relatório.

Terceira regra, de `src/assistant/types.ts:42-48`: `AssistantData` é *"deliberadamente o
mesmo conjunto que as telas chamam. Um assistente com caminho de consulta próprio acaba
reportando um número diferente do da tela que mostra a mesma coisa, e o aplicativo perde a
credibilidade num único dia."*

Essa terceira regra é **imposta por teste de arquitetura**, não por convenção:
`src/layers.test.ts:73` (`test('only the data layer speaks SQL')`) varre toda pasta de `src`
que não seja `src/data`, mais `app/`, e reprova qualquer arquivo cujo código (comentários
removidos) case
`/\b(SELECT\s+[\s\S]*?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[\s\S]*?\bSET\b|DELETE\s+FROM\b)/i`
(`src/layers.test.ts:21`). Só `src/i18n/locales/` é isento, por ser prosa
(`src/layers.test.ts:71`).

---

### 22.3 A porta única: `ask`

`src/assistant/index.ts` exporta quatro coisas: `registerSkills`, `knownSkills`, `ask` e
o re-export de `phase1Skills` e dos tipos (`src/assistant/index.ts:4-5`).

```ts
const registry: Skill[] = [...phase1Skills];                       // linha 30

export function registerSkills(skills: readonly Skill[]): void {   // linhas 32-36
  for (const skill of skills) {
    if (!registry.some((existing) => existing.id === skill.id)) registry.push(skill);
  }
}

export function knownSkills(capabilities: ReadonlySet<Capability>): Skill[] {  // 38-40
  return registry.filter((s) => !s.requires || capabilities.has(s.requires));
}

export async function ask(question: string, context: SkillContext): Promise<Answer>  // 54
```

Fluxo exato de `ask` (`src/assistant/index.ts:54-85`):

1. `const trimmed = question.trim()`. Se vazio, devolve `{ text: 'Pode perguntar.' }`
   (linha 56). Sem `detail`, sem `list`, sem `route`.
2. Percorre `registry` **na ordem do array**, chamando `skill.match(trimmed)`. O primeiro
   `match` não-nulo vence (linhas 58-60). Repare: a varredura é sobre o registro **inteiro**,
   não sobre `knownSkills(...)` — a permissão é conferida depois do casamento, nunca antes.
3. Se a habilidade casou e `skill.requires` não está nas capacidades do contexto, devolve
   uma frase única, literal (linhas 62-68):
   `'Esse número não faz parte do seu acesso. Quem cuida do financeiro consegue ver.'`
   O comentário do código explica o tom: *"dito claramente e sem constrangimento: isto é
   uma fronteira do papel, não uma falha da pessoa."*
   **Observação factual sobre essa frase:** ela fala em "número" e em "financeiro" mesmo
   quando o que foi barrado não é número nem financeiro — "contei 2 sacos de açúcar" sem
   `adjust_stock` e "cadastrar polpa, balde 10 kg" sem `manage_company` recebem essa mesma
   frase. Não há segunda frase de recusa no código.
4. **Não há fall-through:** casada uma habilidade que a pessoa não pode usar, `ask` retorna
   ali. Uma habilidade posterior que a pessoa pudesse usar e que também casasse nunca é
   tentada.
5. Casando e podendo, chama `skill.run(match, { ...context, question: trimmed })`
   (linha 72). A frase original entra no contexto **aqui e só aqui** — é o que as
   habilidades que escrevem carimbam no movimento.
6. Nada casou: monta a resposta de "não sei" (linhas 75-84):
   - com habilidades disponíveis: `'Ainda não sei responder isso. Por enquanto eu sei, por exemplo:'`
   - sem nenhuma: `'Ainda não sei responder isso.'`
   - e em ambos os casos `list: available.map((skill) => ({ label: skill.example }))`.

O comentário nas linhas 81-82 registra por que os exemplos vão em `list` e não em `detail`:
*"Lista, não conta: é o que a frase acima acabou de prometer com o dois-pontos. Estas linhas
ficavam atrás de um botão escrito 'POR QUÊ?'."*

Docblock de `ask` (`src/assistant/index.ts:42-53`), traduzido:

> A checagem de permissão roda *antes* da consulta, que é o desenho de segurança inteiro em
> uma linha: um número que a pessoa não pode ver nunca entra na resposta, então não existe
> nada para um modelo vazar depois. Dizer a um modelo para guardar segredo não é controle —
> o filtro mora no caminho do dado.
>
> Quando um modelo de linguagem for acrescentado, ele fica na frente desta função,
> escolhendo uma habilidade e seus campos. Ele nunca alcança o dado, e nunca produz um
> número.

**`registerSkills` está implementado e não tem chamador em código de produção.** Uma busca
por `registerSkills` encontra a definição (`src/assistant/index.ts:32`) e nada mais; o
registro nasce e permanece igual a `[...phase1Skills]`. O docblock (linhas 24-29) explica
a intenção: *"Módulos registram o que sabem responder e o que sabem preencher, de modo que
ligar um módulo estende o assistente automaticamente em vez de deixá-lo para trás."*
Classificação: **implementado, sem chamador**.

`knownSkills` **tem** chamador: `app/assistant.tsx:105` (a lista de exemplos da tela) e
`src/assistant/index.ts:75` (a resposta de "não sei").

---

### 22.4 Os tipos

#### `AssistantData` — tudo o que o assistente alcança, como funções e nunca como SQL

`src/assistant/types.ts:49-108`. Dezesseis membros:

| Membro | Assinatura | Para que serve |
|---|---|---|
| `listItems` | `(): Promise<ItemWithCost[]>` | catálogo de insumos com `averageRate`, `lastRate`, `onHandBaseUnits` |
| `listProducts` | `(): Promise<Product[]>` | produtos com `recipeId`, `yieldPerUnit`, `unitPackagingCents`, `packagingItems` |
| `loadRecipeGraph` | `(): Promise<Record<string, Recipe>>` | o grafo inteiro de receitas, para `costRecipe` e `shoppingList` |
| `itemCosts` | `(): Promise<ItemCosts>` | taxa fracionária por item |
| `labels` | `(): Promise<Record<string, string>>` | nomes de itens e receitas, para a conta abrir em palavras |
| `recentCostChanges` | `(limit: number): Promise<CostChange[]>` | as últimas mudanças de custo |
| `itemMovements` | `(itemId: string, limit?: number): Promise<MovementRow[]>` | "os movimentos por trás do saldo de um item — o que o `[por quê?]` abre" (comentário na linha 56) |
| `productionOn` | `(fromIso, toIso): Promise<ProducedInWindow[]>` | o que saiu do tacho numa janela |
| `lossesOn` | `(fromIso, toIso): Promise<LossRow[]>` | o que se perdeu numa janela, com motivo |
| `listPlaces` | `(): Promise<Place[]>` | os lugares cadastrados |
| `stockByPlace` | `(): Promise<PlaceStock[]>` | o saldo de cada lugar |
| `defaultPlaceId` | `(): string` | **síncrono**; onde fica a fábrica |
| `recordProduction` | `({ productId, batches, unitsProduced, assistantPhrase? })` | grava produção |
| `recordTransfer` | `({ itemId, toLocationId, baseUnits, assistantPhrase? })` | grava carga |
| `recordCount` | `({ itemId, countedBaseUnits, assistantPhrase? })` | grava contagem |
| `saveItem` | `({ kind, name, purchaseUnit, purchaseToBase, baseUnit }): Promise<string>` | cria insumo |
| `recordPurchase` | `({ itemId, purchaseQuantity, baseUnits, totalCents, supplierName?, assistantPhrase? })` | grava compra |

O `kind` de `saveItem` é `'input' | 'packaging' | 'store_supply'`
(`src/assistant/types.ts:94`). O `totalCents` é `Cents` (`src/assistant/types.ts:104`).

O docblock de `productionOn` (linhas 58-65) registra por que ele existe: *"A capa passou a
dizer isso e o assistente não sabia responder — a pergunta 'quanto saiu hoje' caía no 'ainda
não sei'. Um app em que a tela sabe uma coisa e o assistente não sabe a mesma coisa tem duas
verdades, e é o assistente que perde."*

#### `Draft` — o formulário preenchido esperando um sim humano

```ts
export type Draft = {                                    // src/assistant/types.ts:116-120
  kind: 'purchase' | 'count' | 'item' | 'production' | 'transfer';
  summary: string;
  apply: () => Promise<void>;
};
```

`summary` é *"o que a pessoa lê antes de confirmar, escrito como ela diria em voz alta — com
os números por extenso, nunca como rótulos de campo"* (linhas 110-115).

**`Draft.kind` tem leitor hoje**: `app/assistant.tsx:292` e `:310` usam
`turn.answer.draft.kind === 'item'` para escolher entre "Cadastrado."/"Confirmar e cadastrar"
e "Lançado."/"Confirmar e lançar". Foi dívida nomeada em `docs/insights.md:952-956` ("o
`Draft.kind` continua sem leitor") e fechada depois (`docs/insights.md:2591`). Dos cinco
valores do enum, só `'item'` é distinguido; `'purchase'`, `'count'`, `'production'` e
`'transfer'` caem todos no mesmo rótulo.

#### `Answer` — o que uma habilidade devolve

```ts
export type Answer = {                                   // src/assistant/types.ts:122-145
  text: string;                                          // uma ou duas frases
  detail?: { label: string; value: string }[];           // o que o [por quê?] abre
  list?: { label: string; value?: string }[];            // o que NÃO é conta
  route?: string;                                        // a tela que resolve isso
  draft?: Draft;
};
```

A separação `detail` × `list` é a peça central do mecanismo de `[por quê?]` e está
documentada em `src/assistant/types.ts:127-140`, traduzido:

> As linhas que NÃO são conta: o que o aplicativo sabe fazer, as opções da pergunta de
> volta, os campos do rascunho.
>
> Existe porque `detail` carregava as quatro coisas e a tela só tinha um rótulo para todas:
> "POR QUÊ?". Perguntando o que ele não entende, a resposta terminava em dois-pontos
> prometendo a lista e embaixo aparecia um botão afirmando que ali estava a conta de um
> número que não existia. Lei 6 é sobre abrir a conta de uma conclusão — o que não é conta
> não pode se esconder atrás dela.
>
> Fica aberto na tela, porque nada disso é detalhe: é o que a frase acabou de prometer.

#### `SkillContext` e `Skill`

```ts
export type SkillContext = {                             // src/assistant/types.ts:147-160
  data: AssistantData;
  question?: string;          // preenchido por `ask`; só as habilidades que ESCREVEM usam
  capabilities: ReadonlySet<Capability>;
  locale: import('@/i18n').LocaleSettings;
};

export type Skill = {                                    // src/assistant/types.ts:162-175
  id: string;
  example: string;            // mostrado quando o assistente tem de dizer o que sabe
  requires?: Capability;
  match(question: string): RegExpMatchArray | null;
  run(match: RegExpMatchArray, context: SkillContext): Promise<Answer>;
};
```

Sobre `question` (linhas 149-156): *"Só as habilidades que ESCREVEM o usam, e usam para uma
coisa: carimbar o movimento com a frase que o criou. A condição do plano para deixar um
assistente escrever é que suas escritas fiquem auditáveis, e um movimento que não sabe dizer
de onde veio não é."*

`Capability` é **re-exportado, nunca redefinido** (`src/assistant/types.ts:33-40`): o
vocabulário mora em `src/domain/access.ts` porque três coisas o falam — o RLS do servidor,
o assistente e as telas.

---

### 22.5 O ligamento com o banco: `liveData`

`src/data/assistantData.ts:33-73`. Docblock (linhas 24-32), traduzido: *"Note o que este
arquivo é: um ligamento, não uma consulta. Toda função abaixo é a que as telas já chamam,
com a empresa preenchida. O assistente é fisicamente incapaz de perguntar ao banco qualquer
coisa que as telas não possam perguntar."*

`liveData(companyId: string, timeZone: string): AssistantData`. As decisões de preenchimento
automático, todas registradas:

| Função | O que `liveData` acrescenta | Razão escrita |
|---|---|---|
| `recordCount` | `locationId: defaultLocationId(companyId)` | linhas 45-49: a habilidade só chega aqui depois de conferir que o item está num lugar só; *"a decisão de onde gravar mora em quem sabe fazer a pergunta"* |
| `recordProduction` | `locationId: defaultLocationId(companyId)` e `producedOn: localDate(nowIso(), timeZone)` | linhas 55-61: *"o lote nasce com a data de calendário da fábrica, e transformar o instante em dia precisa do fuso"* |
| `recordTransfer` | `fromLocationId: defaultLocationId(companyId)` | linha 69 |
| `saveItem` | `packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] }` | linha 71 |
| `defaultPlaceId` | `() => defaultLocationId(companyId)` | linha 54 |

`defaultLocationId(companyId)` **é o próprio `companyId`** (`src/data/repository.ts:843-845`):
`ensureLocation` cria uma `location` única cujo id é o `company_id`
(`src/data/repository.ts:854-857`), com `name = ''` e `kind = 'store_room'`. É por isso que
três habilidades precisam **nomear a fábrica no código** — o banco não a nomeia.

---

### 22.6 As ferramentas de linguagem (`src/assistant/text.ts`)

Docblock do módulo (linhas 1-8), traduzido: *"Ele roda no aparelho sem rede, porque a câmara
fria é uma caixa de metal e uma rota de entrega não tem sinal. Reconhecer as vinte perguntas
que as pessoas de fato repetem é aritmética sobre strings, não inteligência — e responde
instantaneamente, o que a versão em rede nunca fará."*

#### `normalize(text: string): string` — linhas 13-20

```ts
return text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')   // as marcas combinantes, escritas assim no c\u00f3digo
  .replace(/\s+/g, ' ')
  .trim();
```

Minúsculas, decompõe acentos e remove as marcas combinantes, colapsa espaços. `"açúcar"` e
`"acucar"` viram a mesma palavra. **Consequência prática nas expressões regulares:** classes
como `[cç]` e `[aã]` em `skills.ts` são inócuas quando aplicadas ao texto normalizado — o
`ç` já virou `c` antes do casamento. Elas estão no código assim mesmo
(`src/assistant/skills.ts:105`, `148`, `187`, `248`).

#### `parseNumber` — re-export de `parseTyped`, linha 30

`export { parseTyped as parseNumber } from '@/domain/number';`. O docblock (linhas 22-29)
registra por que o leitor foi unificado: *"As telas que pegam dinheiro tinham três leitores
diferentes, e o assistente um quarto. A regra antiga dele lia '1.500 picolés' como um e
meio — a mesma ambiguidade, respondida de forma diferente no mesmo app."*

Regra de `parseTyped` (`src/domain/number.ts:32-75`): remove tudo que não é dígito, ponto,
vírgula ou hífen; **o último separador é o decimal**, os outros agrupam. Exceção escrita: um
ponto solitário com exatamente três dígitos atrás e parte inteira diferente de zero é
agrupamento (`src/domain/number.ts:60-63`) — `1.500` é mil e quinhentos, `0.500` é meio. A
mesma prova nunca é aplicada à vírgula, *"porque uma vírgula digitada aqui é ponto decimal, e
tratar '1,500' como mil e quinhentos quebraria a língua em que este app é escrito para
resgatar a que ele não é"* (linhas 55-59). Devolve `null` quando não há dígito.

Exercitado em `src/assistant/assistant.test.ts:554-569`: `'1.250,40'`→1250.4,
`'1250.40'`→1250.4, `'R$ 496'`→496, `'4'`→4, `'abc'`→`null`, `'1.500'`→1500, `'6.000'`→6000,
`'46.000'`→46000, `'0.500'`→0.5.

#### `findByName<T extends { name: string }>(candidates, term): T | null` — linhas 39-72

Quatro passos, nesta ordem:

1. `wanted = normalize(term)`; se vazio, `null`.
2. **Exato normalizado**: `candidates.find(c => normalize(c.name) === wanted)`.
3. **Contém**: filtra por `normalize(c.name).includes(wanted)`.
   - exatamente 1 → devolve-o
   - **mais de 1 → devolve `null`** (linhas 51-65)
4. **Último recurso**: quebra `wanted` em palavras de `length > 3` e devolve o primeiro
   candidato cujo nome contém alguma delas; senão `null`.

O comentário do empate (linhas 52-63) é decisão registrada: *"Isto devolvia o nome mais
curto (…). Com a grade — linha × tipo × sabor — 'morango' casa com doze, e o mais curto é
sorteio: 'Pote 1 litro de morango' ganha de 'Picolé Tradicional de morango' por ter menos
letras, e o assistente gravaria a produção contra a receita errada sem dizer nada a ninguém.
Devolver nulo aqui é o que faz a tela perguntar em vez de adivinhar (…) esta era a única
linha do assistente que decidia calada."*

#### `namesakes<T extends { name: string }>(candidates, term): T[]` — linhas 98-107

O caminho que a Lei 5 exige junto com a recusa. Devolve `[]` quando o termo é vazio, `[]`
quando existe casamento exato, e a lista de contidos quando ela tem mais de um elemento.
Docblock (linhas 90-97): *"dizer só 'não existe' para uma coisa que existe doze vezes é a
Lei 5 ao contrário: o erro tem que impedir E dizer o caminho. Esta função é o caminho."*

#### `movePhrase(change: number, locale = defaultLocale): string` — linhas 84-88

```ts
const percent = Math.abs(change * 100);
if (percent < 0.05) return 'não mudou';
return `${change > 0 ? 'subiu' : 'caiu'} ${formatPercent(Math.abs(change), locale)}`;
```

Três saídas possíveis: `'não mudou'`, `'subiu X%'`, `'caiu X%'`. Limiar: variação menor que
0,05 ponto percentual (isto é, `|change| < 0,0005`). `formatPercent` usa
`Intl.NumberFormat` com `style: 'percent'` e uma casa decimal por padrão
(`src/i18n/index.ts:217-223`).

#### `whichOne` — a pergunta de volta (mora em `skills.ts`, não em `text.ts`)

`src/assistant/skills.ts:35-41`:

```ts
function whichOne<T extends { name: string }>(matches: readonly T[], term: string): Answer {
  return {
    text: `"${term.trim()}" alcança ${matches.length} cadastros. Qual deles?`,
    list: matches.slice(0, 8).map((m) => ({ label: m.name })),
  };
}
```

Oito nomes no máximo, em `list` (não é conta), sem `detail`, sem `route`, sem `draft`.
Chamado por `costOfProduct`, `whatDominates`, `registerProduction` e `whatToBuy`.

---

### 22.7 As dezessete habilidades

`export const phase1Skills: Skill[]` — `src/assistant/skills.ts:1073-1100`. **A ordem do
array é semântica, não arrumação**, e está comentada linha a linha:

| # | Constante | `id` | `requires` | Comentário de ordem no código |
|---|---|---|---|---|
| 1 | `registerPurchase` | `register_purchase` | `place_order` | — |
| 2 | `registerInput` | `register_input` | `manage_company` | linhas 1075-1076: *"'cadastrar X, Y' é alguém criando, e nenhuma pergunta desta lista começa com esse verbo"* |
| 3 | `registerCount` | `register_count` | `adjust_stock` | linhas 1078-1079: antes de `stockOfInput`, *"uma frase carregando um número é alguém contando, não alguém perguntando"* |
| 4 | `registerProduction` | `register_production` | `record_production` | — |
| 5 | `registerTransfer` | `register_transfer` | `dispatch` | — |
| 6 | `stockAtPlace` | `stock_at_place` | — | linhas 1083-1085: antes de `stockOfInput`, *"quem pergunta por um lugar não está perguntando por um item chamado 'na loja'"* |
| 7 | `whereIsItem` | `where_is_item` | — | — |
| 8 | `stockOfInput` | `stock_of_input` | — | — |
| 9 | `eraseHelp` | `erase_help` | `manage_company` | — |
| 10 | `whatToBuy` | `what_to_buy` | `view_cost` | linhas 1090-1091: antes de `listInputs`, *"quem pergunta o que FALTA para um plano não está pedindo a lista do almoxarifado"* |
| 11 | `listInputs` | `list_inputs` | `view_cost` | — |
| 12 | `producedToday` | `produced_today` | — | — |
| 13 | `whatWasLost` | `what_was_lost` | `view_cost` | — |
| 14 | `whatDominates` | `what_dominates` | `view_cost` | — |
| 15 | `whatMoved` | `what_moved` | `view_cost` | — |
| 16 | `costOfProduct` | `cost_of_product` | `view_cost` | — |
| 17 | `priceOfInput` | `price_of_input` | `view_cost` | — |

Quatro habilidades sem `requires` (`stockAtPlace`, `whereIsItem`, `stockOfInput`,
`producedToday`): quantidade não é dinheiro, e todo mundo pode tê-la.

Docblock do módulo (`src/assistant/skills.ts:16-26`), traduzido: *"Um módulo só está pronto
quando o assistente sabe responder sobre ele e preencher seus registros — senão o assistente
nasce bom e vai virando mentiroso conforme o app cresce além dele. Então estas habilidades
saem junto com as telas que espelham, e chamam as mesmas funções de repositório que essas
telas chamam. Toda habilidade aqui é determinística: a frase seleciona a habilidade, o motor
calcula, e a sentença é montada em volta do que o motor devolveu."*

Duas verrugas de código, factuais: o docblock de `whatDominates`
(`src/assistant/skills.ts:180`) e o comentário `/** Skills are ordered: the most specific
phrasing gets first refusal. */` (`src/assistant/skills.ts:455`) ficaram **órfãos** —
imediatamente abaixo de cada um vem o docblock de outra habilidade (`producedToday` na linha
181, `stockOfInput` nas linhas 456-468).

#### 22.7.1 `cost_of_product` — "quanto custa o picolé de morango"

- **Estado:** implementado, alcançável pela tela.
- **`requires`:** `view_cost`. **`example`:** `'quanto custa o picolé de morango'`.
- **Gatilho** (`skills.ts:48-51`), sobre o texto normalizado:
  `/(?:quanto custa|custo (?:do|da|de)|qual o custo (?:do|da|de))\s+(?:o |a |os |as )?(.+)/`
- **Consulta** (em `Promise.all`, `skills.ts:54-59`): `listProducts()`, `loadRecipeGraph()`,
  `itemCosts()`, `labels()`. E, no caminho de fallback, `listItems()`.
- **Cálculo:** `costRecipe(product.recipeId, graph, costs, names)`, depois
  `costPerProductUnit(cost, product.yieldPerUnit, { cents: product.unitPackagingCents, itemsRate: packagingRatePerUnit(product.packagingItems, costs) })`
  para o custo cheio, e `costPerProductUnit(cost, product.yieldPerUnit)` sem embalagem para a
  linha "Massa".
- **Texto:** `` `${product.name} custa ${formatMoney(unit, ctx.locale)} por unidade.` ``
- **`detail`** (quatro linhas, `skills.ts:72-80`): `Massa` (a massa sem embalagem),
  `Embalagem` (`product.unitPackagingCents`), `Custo do lote` (`cost.batchCents`),
  `Perda prevista` (`formatPercent(cost.lossFraction, ...)`).
- **`route`:** `` `/recipes/${product.recipeId}` ``.
- **Fallbacks, nesta ordem** (`skills.ts:85-94`):
  1. não é produto com receita e rendimento → tenta `findByName` nos itens e devolve
     `rateAnswer(item, ctx)` (a resposta de preço de insumo)
  2. empate: `[...namesakes(products, term), ...namesakes(items, term)]` → `whichOne(...)`
  3. nada: `` `Não encontrei nada chamado "${term.trim()}" no cadastro.` ``

#### 22.7.2 `price_of_input` — "quanto está o açúcar"

- **`requires`:** `view_cost`. **`example`:** `'quanto está o açúcar'`.
- **Gatilho** (`skills.ts:103-106`):
  `/(?:quanto (?:esta|ta|custa)|pre[cç]o (?:do|da|de))\s+(?:o |a |os |as )?(.+)/`
- **Consulta:** `listItems()`.
- **Não achou:** `` `Não encontrei "${m[1].trim()}" no almoxarifado.` `` (sem `route`).
- **Achou:** delega a `rateAnswer`.

##### `rateAnswer(item, ctx): Answer` — `skills.ts:115-141`

Função compartilhada por `cost_of_product` e `price_of_input`.

- `perThousand = formatMoney(Math.round(item.averageRate * 1_000), ctx.locale)` — o custo
  médio a cada mil unidades-base. `averageRate` é `Rate` (centavos fracionários por
  unidade-base): polpa a R$ 12,40/kg é `1,24` (`src/domain/money.ts:52-55`), e
  `1,24 × 1000 = 1240` centavos = R$ 12,40.
- **Texto:** `` `${item.name} está em ${perThousand} a cada 1.000 ${item.baseUnit}.` ``
- **`detail`**, montado condicionalmente:
  - sempre: `Custo médio` → `` `${perThousand} a cada 1.000 ${item.baseUnit}` ``
  - se `item.lastRate !== null`: `Última compra` → mesmo formato com `lastRate`
  - se `item.purchaseUnit && item.purchaseToBase`: rótulo = **o nome da embalagem**
    (`'balde 10 kg'`), valor = `formatMoney(Math.round(item.averageRate * item.purchaseToBase))`
- Sem `route`, sem `draft`.

#### 22.7.3 `what_moved` — "o que mudou de preço"

- **`requires`:** `view_cost`. **`example`:** `'o que mudou de preço'`.
- **Gatilho** (`skills.ts:148`):
  `/(?:o que|oq) (?:mudou|subiu|caiu|aumentou)|mudan[cç]a de pre[cç]o/` — **sem grupo de
  captura**; `run` ignora `m`.
- **Consulta:** `recentCostChanges(5)` — `SELECT h.item_id, i.name, h.previous_rate,
  h.new_rate, h.observed_at FROM item_cost_history h JOIN items i ... WHERE h.company_id = ?
  AND h.previous_rate IS NOT NULL ORDER BY h.observed_at DESC LIMIT ?`
  (`src/data/repository.ts:2055-2061`).
- **Filtro:** `c.previousRate !== null && c.previousRate !== c.newRate`.
- **Vazio:** `'Nenhum preço mudou desde a última vez. Está tudo estável.'`, sem `detail`,
  sem `route`. Comentário (`skills.ts:154-155`): *"'Nada aconteceu' é uma resposta de verdade
  e é dita claramente. Inventar um alerta para parecer útil ensina as pessoas a ignorarem os
  de verdade."*
- **Com mudança:** ordena por variação relativa absoluta
  `Math.abs((newRate - previousRate) / (previousRate || 1))` e pega a maior.
  **Texto:** `` `${moved.length} ${moved.length === 1 ? 'item mudou' : 'itens mudaram'} de preço. O maior foi ${worst.name}, que ${movePhrase(change, ctx.locale)}.` ``
- **`detail`:** uma linha por item movido, `label` = nome, `value` = `movePhrase(...)`.
- **`route`:** `'/purchase'`.

#### 22.7.4 `produced_today` — "quanto saiu hoje"

- **Sem `requires`.** **`example`:** `'quanto saiu hoje'`.
- **Gatilho** (`skills.ts:186-188`):
  `/(?:quanto|quantos|o que).*(?:saiu|sa[ií]ram|produz(?:i|iu|imos)).*(?:hoje)?|produ[cç][aã]o de hoje/`
- **Janelas:** `dayWindow(nowIso(), ctx.locale.timeZone)` para hoje e
  `dayWindow(nowIso(), ctx.locale.timeZone, -7)` para o **mesmo dia da semana passada**.
  `dayWindow` mede o deslocamento em cada ponta separadamente para acertar em dia de troca de
  horário (`src/domain/day.ts:49-68`).
- **Consulta:** duas chamadas paralelas a `productionOn(from, to)` —
  `SUM(m.quantity_base_units) ... WHERE kind = 'production' AND occurred_at >= ? AND
  occurred_at < ? AND <não estornado> GROUP BY item HAVING total > 0 ORDER BY total DESC`
  (`src/data/repository.ts:2581-2591`).
- **Total zero:** `{ text: 'Nada saiu do tacho hoje ainda.', route: '/production' }` — sem
  `detail`.
- **Comparação** (`skills.ts:206-212`), três casos exatos:
  - `entao === 0` → `'Não há semana passada para comparar.'`
  - `diferenca === 0` → `'O mesmo que no mesmo dia da semana passada.'`
  - senão → `` `${formatQuantity(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'} que no mesmo dia da semana passada.` ``
- **Texto:** `` `Saíram ${formatQuantity(total, ctx.locale)} unidades hoje. ${comparacao}` ``
- **`detail`:** uma linha por produto, `value` = `` `${formatQuantity(r.baseUnits)} unidades` ``.
- **`route`:** `'/production'`.

#### 22.7.5 `what_was_lost` — "o que a gente perdeu esse mês"

- **`requires`:** `view_cost`. **`example`:** `'o que a gente perdeu esse mês'`.
- **Gatilho** (`skills.ts:247-248`):
  `/(?:o que|quanto).*(?:perde|perdi|perdeu|perdemos)|perdas?( do| deste| desse)? (?:mes|mês|periodo)/`
- **Janela:** de `dayWindow(nowIso(), tz, -29).from` até `dayWindow(nowIso(), tz).to` —
  **30 dias**, contando hoje.
- **Consulta:** `lossesOn(from, to)`, que já devolve `valueCents` (a taxa congelada vezes a
  quantidade, arredondada uma vez, `src/data/repository.ts:2226`), ordenada do mais caro
  para o mais barato.
- **Vazio:** `{ text: 'Nenhuma perda registrada nos últimos 30 dias.', route: '/losses' }`.
- **Agregação:** soma `valueCents` **por motivo** num `Map` e elege o maior. O comentário
  (`skills.ts:262-263`) diz por quê: *"é o motivo que muda a decisão: derreteu manda olhar o
  freezer, venceu manda olhar a compra."*
- **Texto:** `` `Você perdeu ${formatMoney(total)} em 30 dias. O que mais pesou foi ${MOTIVO[pior[0]] ?? pior[0]}, com ${formatMoney(pior[1])}.` ``
- **`detail`:** as **cinco** primeiras perdas, `value` = `` `${formatMoney(p.valueCents)} · ${MOTIVO[p.reason] ?? p.reason}` ``.
- **`route`:** `'/losses'`.

**O mapa `MOTIVO`** (`src/assistant/skills.ts:234-240`) — as cinco palavras da perda em
português, cravadas no módulo por decisão:

| chave (`loss_reason`) | frase |
|---|---|
| `expired` | `coisa vencida` |
| `melted` | `coisa derretida` |
| `broken` | `coisa quebrada` |
| `courtesy` | `cortesia` |
| `internal_use` | `consumo interno` |

Motivo desconhecido cai no próprio código (`MOTIVO[p.reason] ?? p.reason`).

#### 22.7.6 `what_dominates` — "o que mais pesa no picolé de morango"

- **`requires`:** `view_cost`.
- **Gatilho** (`skills.ts:286`):
  `/(?:o que mais pesa|o que pesa mais|maior custo)\s+(?:no|na|em|de|do|da)?\s*(.+)/`
- **Consulta:** `listProducts()`, `loadRecipeGraph()`, `itemCosts()`, `labels()`.
- **Cálculo:** `costRecipe(...)`, ordena `cost.lines` por `share` decrescente.
- **Caminhos de recusa:** `namesakes(products, m[1])` → `whichOne`; sem receita →
  `` `Não encontrei a receita de "${m[1].trim()}".` ``; receita sem linhas →
  `` `${product.name} ainda não tem ingredientes.` ``
- **Texto:** `` `${top.label} responde por ${Math.round(top.share * 100)}% do custo de ${product.name}.` ``
- **`detail`:** todas as linhas ordenadas, `value` = `` `${formatMoney(line.totalCents)} · ${Math.round(line.share * 100)}%` ``.
- **`route`:** `` `/recipes/${product.recipeId}` ``.

Nota de aritmética: as `totalCents` das linhas vêm de `allocateByWeight` dentro de
`costRecipe` (`src/domain/recipe.ts:177-181`), justamente para que **a conta aberta feche
exatamente com o número que ela explica**.

#### 22.7.7 `register_purchase` — "comprei 4 sacos de açúcar por 236"

- **`requires`:** `place_order`. **Escreve** (via rascunho).
- **Gatilho** (`skills.ts:329-332`):
  `/(?:comprei|compramos|chegou|recebi)\s+([\d.,]+)\s*(?:\w+\s+)?(?:de\s+)?(.+?)\s+por\s+(?:r\$\s*)?([\d.,]+)/`
  Três capturas: quantidade, item, valor pago.
- **Consulta:** `listItems()`.
- **Recusas:** item não encontrado → `` `Não encontrei "${m[2].trim()}" no almoxarifado.` ``;
  `packs === null || packs <= 0 || paid === null || paid <= 0` →
  `'Não entendi a quantidade ou o valor. Pode repetir com os números?'`
- **Conversão:** `purchaseToBaseUnits(item, packs)` — a **mesma função do repositório** que a
  tela de compra usa (`Math.round(purchaseQuantity * (item.purchaseToBase ?? 1))`,
  `src/data/repository.ts:1237-1240`). O comentário (`skills.ts:344-348`) registra a
  correção: *"Foi digitada à mão aqui também, o que fazia três cópias de uma regra: tela,
  repositório e assistente. Três cópias concordam até uma ser corrigida."*
  `totalCents = fromDecimal(paid)` (`Math.round(paid * 100)`).
- **Texto:** `'Preparei o lançamento. Confira antes de eu gravar.'`
- **`detail`:** `Item` (nome), `Quantidade`
  (`` `${formatQuantity(packs)} × ${item.purchaseUnit ?? 'unidade'} = ${formatQuantity(baseUnits)} ${item.baseUnit}` ``),
  `Total` (`formatMoney(totalCents)`).
- **`draft.kind`:** `'purchase'`. **`summary`:**
  `` `Lançar ${formatQuantity(packs)} ${item.purchaseUnit ?? 'unidade'} de ${item.name} por ${formatMoney(totalCents)}. Isso move o custo médio e recalcula as receitas que usam esse item.` ``
- **`apply`:** `recordPurchase({ itemId, purchaseQuantity: packs, baseUnits, totalCents, assistantPhrase: ctx.question })`.
- **`route`:** `'/purchase'`.

Docblock (`skills.ts:318-324`): *"O assistente preenche o formulário; ele não grava nada.
Mudanças de preço estão no piso que nenhum nível de autonomia atravessa sozinho, porque uma
errada só aparece meses depois, numa margem que ninguém mais consegue explicar."*

#### 22.7.8 `list_inputs` — "quais insumos eu tenho"

- **`requires`:** `view_cost`.
- **Gatilho** (`skills.ts:391-394`):
  `/(?:quais|quantos|liste?|lista de|meus|minhas)\s+(?:os |as )?(?:insumos|ingredientes|materiais|itens)/`
- **Consulta:** `listItems()`, filtrada por `kind === 'input' || kind === 'packaging'`.
- **Vazio:** `{ text: 'Ainda não há nenhum insumo cadastrado.', route: '/inputs' }`.
- **Cálculo:** `held = Σ Math.round(item.averageRate * item.onHandBaseUnits)`;
  `unpriced = stock.filter(i => i.averageRate <= 0)`.
- **Texto:** `` `Você tem ${stock.length} itens cadastrados, com ${formatMoney(held)} parado no almoxarifado.` ``
  mais, quando há itens sem preço,
  `` ` ${unpriced.length} ainda sem preço — lance a nota e o custo aparece sozinho.` ``
- **`detail`:** um por item; `value` = `` `${formatMoney(Math.round(averageRate * 1_000))} / 1.000 ${baseUnit}` `` ou a string `'sem preço'`.
- **`route`:** `'/inputs'`.

#### 22.7.9 `erase_help` — "como apago os dados de exemplo"

- **`requires`:** `manage_company`. **Não age: só orienta.**
- **Gatilho** (`skills.ts:439-440`):
  `/(?:apagar|apago|limpar|limpo|zerar|zero|excluir)\s+(?:os |as |o |a )?(?:dados|tudo|exemplo|cadastro|banco)/`
- **Não consulta nada** — `run: async (_m, _ctx) => ({...})`, sem `await`.
- **Texto:** `'Isso fica em Ajustes. Dá para limpar uma área de cada vez ou tudo de uma vez, e antes de apagar o aplicativo conta exatamente quantos insumos, receitas e produtos vão embora.'`
- **`list`** (não `detail` — é instrução, não aritmética, `skills.ts:445-450`):

  | label | value |
  |---|---|
  | `Uma área` | `compras, receitas, produtos ou insumos` |
  | `Tudo` | `e o exemplo não volta sozinho depois` |
  | `Voltar atrás` | `não tem — por isso a confirmação é por extenso` |

- **`route`:** `'/settings'`. Sem `draft`, e o teste
  (`assistant.test.ts:389-396`) trava isso: *"A habilidade não tem como agir: ela devolve
  palavras e uma rota, e nada mais."*

#### 22.7.10 `stock_of_input` — "quanto tem de açúcar"

- **Sem `requires`.** Docblock (`skills.ts:456-468`), traduzido: *"A quantidade não é
  dinheiro, então todo mundo pode tê-la. O que ela **vale** é, então essa linha é montada só
  para quem pode ver custo — decidido aqui, antes de a frase existir, em vez de deixar um
  número fora do texto e torcer. (…) Lei 3: nenhum número aparece sozinho. Um saldo sem a
  data em que foi conferido é um número pedindo para ser acreditado, e este diz na cara
  quando ninguém nunca o contou."*
- **Gatilho** (`skills.ts:473-475`):
  `/(?:quantos?\s+(?:tem|tenho|resta|restam|sobra|sobrou|sobraram)|estoque\s+(?:de|do|da))\s+(?:de\s+)?(?:o |a |os |as )?(.+)/`
- **Consulta:** `listItems()` e depois `itemMovements(item.id, 20)`.
- **Última conferência:** `movements.find(mv => mv.kind === 'adjustment')` — o primeiro
  ajuste dentro dos 20 movimentos mais recentes.
- **Texto, dois casos:**
  - com conferência: `` `Você tem ${held} de ${item.name}, conferido em ${formatDayMonth(counted.occurredAt, ctx.locale)}.` ``
  - sem: `` `Você tem ${held} de ${item.name}, pelas notas lançadas. Ninguém conferiu a prateleira ainda.` ``
  onde `held = `` `${formatQuantity(item.onHandBaseUnits)} ${item.baseUnit}` ``.
- **`detail`, montado condicionalmente:**

  | linha | condição |
  |---|---|
  | `Em estoque` → `held` | sempre |
  | `Última conferência` → data `DD/MM` ou `'ninguém conferiu ainda'` | sempre |
  | `Valor parado` → `formatMoney(Math.round(averageRate * onHandBaseUnits))` | **só se** `ctx.capabilities.has('view_cost')` |
  | `Dá quantos <purchaseUnit>` → `formatQuantity(onHandBaseUnits / purchaseToBase)` | só se `purchaseUnit && purchaseToBase` |

- **`route`:** `` `/inputs/${item.id}` ``. Não achou: `` `Não encontrei "${m[1].trim()}" no almoxarifado.` ``

#### 22.7.11 `register_count` — "contei 2 sacos de açúcar"

- **`requires`:** `adjust_stock`. **Escreve** (via rascunho).
- **Gatilho** (`skills.ts:533-536`):
  `/(?:contei|conferi|tem|sobrou|sobraram|restam)\s+([\d.,]+)\s*(?:\w+\s+)?(?:de\s+)?(.+)/`
- **Consulta:** `listItems()`, depois `stockByPlace()`.
- **Recusas iniciais:** item não achado; `packs === null || packs < 0` →
  `'Não entendi a quantidade. Pode repetir com o número?'`
- **A guarda de duas salas** (`skills.ts:555-564`), que é o achado escrito nas linhas 547-554:
  filtra os `PlaceStock` que têm uma linha do item; se `holding.length > 1`, **não há
  rascunho**:
  `` `${item.name} está em ${holding.length} lugares: ${nomes}. Conte um lugar por vez - abra o item e escolha o lugar.` ``
  com `route: `/inputs/${item.id}`` e `nomes` = `place.locationName.trim() || 'Fábrica'`
  juntados por `', '`. Sem essa checagem, *"o assistente compara com o total da empresa e
  grava a diferença no almoxarifado — a mesma teleportação que a tela de detalhe tinha."*
- **Conversão:** `factor = item.purchaseToBase ?? 1`;
  `countedBaseUnits = Math.round(packs * factor)`; `expected = item.onHandBaseUnits`;
  `delta = countedBaseUnits - expected`.
- **A frase da diferença**, três casos exatos (`skills.ts:572-577`):
  - `delta === 0` → `'Bate com o que o sistema esperava.'`
  - `delta < 0` → `` `Estão faltando ${asWords(-delta)}.` ``
  - `delta > 0` → `` `Estão sobrando ${asWords(delta)}.` ``
  com `asWords(n) = `${formatQuantity(n)} ${item.baseUnit}``.
- **Texto:** `'Preparei a contagem. Confira antes de eu gravar.'`
- **`detail`:** `Item`, `Você contou`
  (`` `${formatQuantity(packs)} × ${item.purchaseUnit ?? 'unidade'} = ${asWords(countedBaseUnits)}` ``),
  `O sistema esperava` (`asWords(expected)`), `Diferença` (a frase acima).
- **`draft.kind`:** `'count'`. **`summary`:**
  `` `Registrar que você contou ${asWords(countedBaseUnits)} de ${item.name}. ${difference} A diferença fica registrada e nada é apagado.` ``
- **`apply`:** `recordCount({ itemId, countedBaseUnits, assistantPhrase: ctx.question })` —
  e `liveData` acrescenta `locationId: defaultLocationId(companyId)`.
- **`route`:** `` `/inputs/${item.id}` ``.

#### 22.7.12 `register_input` — "cadastrar polpa de morango, balde 10 kg"

- **`requires`:** `manage_company`. **Escreve** (cria item, nenhum movimento).
- **Gatilho, e é o único que casa no texto CRU** (`skills.ts:636`):
  `/(?:cadastrar|cadastre|criar|crie|novo)\s+(?:insumo\s+)?(.+?)\s*,\s*(.+)$/i`
  Razão escrita (`skills.ts:626-635`): *"`normalize` tira acentos para que 'acai' ache
  'açaí' — exatamente certo quando a frase MENCIONA algo que já existe. Aqui a frase nomeia
  algo novo, e a captura normalizada poria 'polpa de acai' no catálogo da pessoa para
  sempre. Os verbos não têm acento, então um casamento cru sem diferenciar maiúsculas não
  custa nada."*
- **Duplicidade: comparação exata, nunca `findByName`** (`skills.ts:646-647`):
  `items.find(i => normalize(i.name) === normalize(name))`. Razão (linhas 642-645): *"aquele
  fallback está certo quando alguém MENCIONA um item e errado ao decidir que um nome está
  tomado: 'polpa de açaí' compartilha 'polpa' com 'polpa de morango', e uma fábrica tem
  várias."* Existindo: `` `"${existing.name}" já está cadastrado.` `` com
  `route: `/inputs/${existing.id}``, **sem rascunho**.
- **Nome curto:** `if (name.length < 2) return { text: 'Não entendi o nome do insumo.' }`.
- **Unidade-base cravada:** `const baseUnit = 'g'` (`skills.ts:655`). O assistente **não sabe
  criar insumo em `ml` ou `un`** — NÃO IMPLEMENTADO.
- **Leitura da embalagem:** `packSize(pack, 'g')` (`src/domain/measure.ts:35-54`). Ele
  conhece três escalas (`g`/`ml`/`un`) e recusa quando há dois números na frase, quando a
  palavra não está na escala, ou quando o total não é inteiro.
- **Texto, dois casos:**
  - legível: `'Preparei o cadastro. Confira antes de eu gravar.'`
  - ilegível: `'Preparei o cadastro. Não consegui ler o tamanho da embalagem — dá para completar depois na tela.'`
- **`list`** (não `detail`, porque são campos do rascunho e não conta, `skills.ts:662-671`):
  `Nome` → o nome; `Embalagem` → o texto da embalagem; `Quanto vem dentro` →
  `` `${formatQuantity(perPack)} g` `` ou a string `'a completar'`.
- **`draft.kind`:** `'item'`. **`summary`:**
  `` `Cadastrar ${name}, comprado em ${pack}` `` + (`` `, com ${formatQuantity(perPack)} g dentro. ` `` ou `` `. ` ``) +
  `'O preço não entra aqui: ele vem da primeira nota de compra.'`
- **`apply`:** `saveItem({ kind: 'input', name, purchaseUnit: pack, purchaseToBase: perPack, baseUnit: 'g' })`.
- **`route`:** `'/inputs'`.

#### 22.7.13 `stock_at_place` — "o que tem na loja centro"

- **Sem `requires`.**
- **Gatilho** (`skills.ts:704-705`):
  `/(?:o que|quanto|quantos|que)\s+(?:tem|tenho|ha|resta|restam)\s+(?:na|no|em)\s+(.+)/`
- **Consulta:** `stockByPlace()` e `listPlaces()`.
- **A nomeação do padrão** (`skills.ts:713-714`), porque o banco grava `name = ''`:
  `const nameOf = (id, raw) => raw.trim() || (id === ctx.data.defaultPlaceId() ? 'Fábrica' : id)`
- **Busca do lugar**, duas tentativas (`skills.ts:716-720`): nome contendo o termo; e, se o
  termo casar `/fabrica|almoxarifado|estoque/`, o lugar cujo `locationId ===
  defaultPlaceId()`.
- **Não achou:** distingue "existe mas está vazio" de "não existe" —
  `` `Não tem nada em ${asked} agora.` `` ou
  `` `Não encontrei um lugar chamado "${asked}".` ``, ambos com `route: '/places'`.
- **Texto, dois casos:**
  - uma linha só: `` `Em ${where} tem ${formatQuantity(first.baseUnits)} ${first.baseUnit} de ${first.name}.` ``
  - várias: `` `Em ${where} tem ${place.lines.length} itens.` ``
- **`detail`:** uma linha por item (`` `${formatQuantity(l.baseUnits)} ${l.baseUnit}` ``), mais
  **`Valor parado`** (`formatMoney(place.valueCents)`) **só se** `ctx.capabilities.has('view_cost')`.
- **`route`:** `'/places'`.

#### 22.7.14 `where_is_item` — "onde está o açúcar"

- **Sem `requires`.** Docblock (`skills.ts:754-759`): *"O mesmo saldo lido pelo outro eixo.
  Uma consulta só, dois eixos: se esta habilidade tivesse SQL próprio ela acabaria
  discordando da tela na semana em que alguém mexesse numa das duas."*
- **Gatilho** (`skills.ts:763`):
  `/onde\s+(?:esta|estao|fica|ficam|tem)\s+(?:o |a |os |as )?(.+)/`
- **Consulta:** `listItems()` e `stockByPlace()`; usa o mesmo `nameOf`.
- **Nenhum lugar:** `` `Não tem ${item.name} em lugar nenhum agora.` ``, `route: '/places'`.
- **Texto, dois casos:**
  - um lugar: `` `Todo o ${item.name} está em ${spread[0].where}: ${say(...)}.` ``
  - vários: `` `O ${item.name} está em ${spread.length} lugares.` ``
- **`detail`:** `label` = nome do lugar, `value` = `` `${formatQuantity(n)} ${item.baseUnit}` ``.
- **`route`:** `'/places'`. **Não mostra dinheiro em nenhum caso.**

#### 22.7.15 `register_production` — "produzi 480 picolés de morango"

- **`requires`:** `record_production`. **Escreve** (via rascunho).
- **Gatilho** (`skills.ts:810-813`):
  `/(?:produzi|fiz|fabriquei|sairam|rodei)\s+([\d.,]+)\s+(?:\w+\s+)??(?:de\s+)?(.+?)(?:\s+em\s+([\d.,]+)\s+tachos?)?$/`
  Três capturas: unidades, produto, e **opcionalmente** tachos.
- **Consulta:** `listProducts()` filtrada por `p.recipeId`, depois `loadRecipeGraph()`.
- **Recusas:** empate → `whichOne`; sem produto →
  `` `Não encontrei um produto chamado "${m[2].trim()}" com ficha técnica.` ``;
  `units === null || units <= 0` → `'Não entendi quantas unidades saíram. Pode repetir com o número?'`;
  tachos ditos e ilegíveis → `'Não entendi quantos tachos foram.'`;
  receita ausente do grafo → `` `A receita de ${product.name} não está neste aparelho.` ``;
  ficha sem rendimento → `` `A ficha de ${product.name} não diz quanto rende um tacho.` ``
- **A conta, exatamente** (`skills.ts:837-854`):
  ```
  perUnit  = product.yieldPerUnit ?? 0
  porTacho = perUnit > 0 ? Math.floor((recipe.yieldAmount * (1 - recipe.lossFraction)) / perUnit) : 0
  batches  = declarados ?? (porTacho > 0 ? units / porTacho : 0)
  planned  = Math.floor(porTacho * batches)
  ```
  A decisão registrada em `skills.ts:841-848`: *"Sem tacho dito, o consumo vem do que saiu —
  não de um tacho suposto. Isto assumia `1` calado, e um tacho suposto é polpa debitada que
  ninguém declarou: três tachos rodados e um tacho baixado deixa dois tachos de polpa na
  prateleira que não existem mais."*
- **A suposição dita em voz alta** (`skills.ts:868-870`): quando os tachos **não** foram
  ditos, o texto ganha o sufixo
  `' Contei os insumos pelo que saiu; se rodou tacho cheio, diga "em 2 tachos" que eu refaço.'`
- **Texto:** `'Preparei a produção. Confira antes de eu gravar.'` + o sufixo acima quando cabe.
- **`detail`:** `Produto`; `Tachos` → `String(batches)` quando dito, ou
  `` `${batches.toFixed(2)} (pelo que saiu)` `` quando deduzido; `Saíram` →
  `` `${formatQuantity(units)} un` ``; e, quando `planned > 0`, `A ficha previa` →
  `` `${formatQuantity(planned)} un` ``.
- **`draft.kind`:** `'production'`. **`summary`:**
  `` `Registrar ${formatQuantity(units)} unidades de ${product.name}, em ${batches === 1 ? 'um tacho' : `${Number(batches.toFixed(2))} tachos`}. Os insumos saem do almoxarifado e o custo por unidade fica congelado nesta corrida.` ``
- **`apply`:** `recordProduction({ productId, batches, unitsProduced: units, assistantPhrase: ctx.question })`.
- **`route`:** `'/production'`.

#### 22.7.16 `register_transfer` — "mandei 6000 de açúcar para a loja centro"

- **`requires`:** `dispatch`. **Escreve** (via rascunho).
- **Gatilho** (`skills.ts:906-909`):
  `/(?:mandei|enviei|levei|transferi|mandar)\s+([\d.,]+)\s*(?:\w+\s+)??(?:de\s+)?(.+?)\s+(?:para|pra|pro)\s+(?:a |o |as |os )?(.+)/`
- **Consulta:** `listItems()`, `listPlaces()`, `defaultPlaceId()`, e depois `stockByPlace()`.
- **Destino:** procurado entre os lugares **que não são o padrão**
  (`places.filter(p => p.id !== from)`).
- **Recusa cedo e por escrito** (docblock, `skills.ts:895-901`): *"se o lugar não existe, se
  o item não existe, ou se não tem tanto lá, nada é preparado. Um rascunho que só falha na
  hora de gravar é pior que nenhum, porque a pessoa já confiou nele."* As três frases:
  - `` `Não encontrei "${m[2].trim()}" no almoxarifado.` ``
  - `` `Não encontrei um lugar chamado "${m[3].trim()}". Cadastre ele primeiro.` `` (`route: '/places'`)
  - `'Não entendi a quantidade. Pode repetir com o número?'`
  - saldo insuficiente: `` `Tem só ${say(held)} de ${item.name} na fábrica, e você falou em ${say(amount)}.` `` (`route: '/transfer'`)
- **Texto:** `'Preparei a transferência. Confira antes de eu gravar.'`
- **`detail`:** `O que vai`, `Quanto`, `De onde` (`nameOf(from, '')` → `'Fábrica'`),
  `Para onde`, `Fica na fábrica` (`say(held - amount)`).
- **`draft.kind`:** `'transfer'`. **`summary`:**
  `` `Mandar ${say(amount)} de ${item.name} da ${nameOf(from, '')} para ${nameOf(to.id, to.name)}. Loja própria é transferência, não venda: o saldo muda de sala e a empresa continua com a mesma coisa.` ``
- **`apply`:** `recordTransfer({ itemId, toLocationId: to.id, baseUnits: amount, assistantPhrase: ctx.question })`.
- **`route`:** `'/transfer'`.

#### 22.7.17 `what_to_buy` — "o que falta para 3 tachos de cada"

- **`requires`:** `view_cost`. **Não escreve e não reserva nada.**
- **Gatilho** (`skills.ts:992-995`):
  `/(?:o que|quanto|do que)\s+(?:eu\s+)?(?:falta|preciso|precisa|tenho que|tem que)\s*(?:comprar)?[^\d]*([\d.,]+)\s*tachos?\s*(?:de\s+(.+))?$/`
- **"De cada" é o plano da fábrica inteira** (`skills.ts:1007-1008`): o alvo é considerado
  "todos" quando a segunda captura está ausente/vazia ou casa
  `/^(cada|todos|todas|tudo|cada um)$/` sobre o texto normalizado. Caso contrário,
  `findByName` no produto, com `namesakes`/`whichOne` no empate.
- **Consulta:** `listProducts()` filtrada por `recipeId`, depois `loadRecipeGraph()` e
  `listItems()`.
- **Cálculo:** `shoppingList(plan, graph, prateleira)` (`src/domain/recipe.ts:360-392`), com
  `plan = plano.map(p => ({ recipeId: p.recipeId!, batches, yieldPerUnit: p.yieldPerUnit, packaging: p.packagingItems }))`
  e `prateleira = new Map(items.map(i => [i.id, i.onHandBaseUnits]))`. `shoppingList` explode
  sub-receitas, soma a embalagem **por unidade prevista** e devolve
  `{ itemId, needed, held, missing: Math.max(0, needed - held) }` ordenado por `missing`
  decrescente.
- **A frase do plano:** `dizPlano` =
  `` `${formatQuantity(batches)} tachos de cada um dos ${plano.length} produtos` `` ou
  `` `${formatQuantity(batches)} tachos de ${plano[0].name}` ``.
- **Nada falta** (comentário `skills.ts:1041-1042`: *"'Está tudo bem' é estado válido"*):
  `` `Para ${dizPlano}, não falta nada: dá para começar com o que está na prateleira.` ``
  com `detail` listando **todos** os itens do plano
  (`` `precisa ${formatQuantity(Math.round(needed))} de ${formatQuantity(held)} ${baseUnit}` ``)
  e `route: '/inputs'`.
- **Falta alguma coisa:**
  `` `Para ${dizPlano}, faltam ${faltando.length} ${faltando.length === 1 ? 'insumo' : 'insumos'}.` ``
  com `detail` = só os que faltam:
  `` `faltam ${formatQuantity(Math.round(missing))} ${unidade} (precisa ${formatQuantity(Math.round(needed))}, tem ${formatQuantity(held)})` ``
  e `route: '/purchase'`.
- Recusas: `batches === null || batches <= 0` →
  `'Não entendi quantos tachos. Pode repetir com o número?'`; nenhum produto com ficha →
  `{ text: 'Nenhum produto tem ficha técnica ainda.', route: '/products' }`; alvo não achado
  → `` `Não encontrei um produto chamado "${alvo}" com ficha técnica.` ``

Nota da própria habilidade (`skills.ts:972-987`): ela é **a conta do avesso** — *"'precisa de
18.000 g de polpa' não decide nada para quem tem 40.000 na prateleira; 'faltam 6.000'
decide"* — e é simulação sobre o saldo de agora: *"o saldo continua sendo o que os movimentos
somam."*

---

### 22.8 Tabela de rotas devolvidas

Todas resolvem para telas que existem.

| `route` | Arquivo | Quem devolve |
|---|---|---|
| `/purchase` | `app/purchase.tsx` | `what_moved`, `register_purchase`, `what_to_buy` (faltando) |
| `/inputs` | `app/inputs/index.tsx` | `list_inputs`, `register_input`, `what_to_buy` (nada falta) |
| `/inputs/:id` | `app/inputs/[id].tsx` | `stock_of_input`, `register_count`, `register_input` (duplicado) |
| `/recipes/:id` | `app/recipes/[id].tsx` | `cost_of_product`, `what_dominates` |
| `/production` | `app/(tabs)/production.tsx` | `produced_today`, `register_production` |
| `/losses` | `app/losses.tsx` | `what_was_lost` |
| `/places` | `app/places.tsx` | `stock_at_place`, `where_is_item`, `register_transfer` (lugar inexistente) |
| `/transfer` | `app/transfer.tsx` | `register_transfer` |
| `/products` | `app/products/index.tsx` | `what_to_buy` (sem ficha) |
| `/settings` | `app/settings.tsx` | `erase_help` |

---

### 22.9 O mecanismo do `[por quê?]`

#### A regra: `detail` é conta, `list` é o resto

A Lei 6 do projeto ("toda conclusão abre a conta") está implementada como **dois campos
distintos da `Answer`**, e a separação é resultado de um defeito real corrigido
(`src/assistant/types.ts:127-140`, transcrito em 22.4):

| Campo | Semântica | Renderização |
|---|---|---|
| `detail` | a **aritmética** por trás do número que a frase afirmou | **fechado**; abre com o botão `[POR QUÊ?]` |
| `list` | o que **não** é conta: a lista do que o app sabe, as opções da pergunta de volta, os campos do rascunho | **aberto**, sempre visível |

Quem devolve `list` e nunca `detail`: `whichOne` (opções do desempate), `erase_help`
(instruções), `register_input` (campos do rascunho) e a resposta de "ainda não sei"
(exemplos). Quem devolve `detail`: as onze habilidades que afirmam um número.

O teste que segura isso: `assistant.test.ts:329-338` —
`assert.equal(answer.detail, undefined, 'a list of examples is not arithmetic')`.

#### A folha na tela do assistente

`app/assistant.tsx` implementa o `[por quê?]` **na própria tela**, não com o componente
`WhySheet`:

- Estado por turno: `type Turn = { question: string; answer: Answer; open: boolean; applied: boolean }`
  (`app/assistant.tsx:81`).
- Alternador (`app/assistant.tsx:136-137`):
  `setTurns(prev => prev.map((t, i) => (i === index ? { ...t, open: !t.open } : t)))`.
- Renderização (`app/assistant.tsx:243-254`): `turn.open && turn.answer.detail` →
  uma `ListRow` por linha, com `label`, `trailing={line.value}` e `trailingTone="muted"`.
  Comentário: *"A conta aberta (Lei 6): cada parcela com o que ela vale, na régua da linha de
  lista em vez de numa grade escrita à mão."*
- O botão só aparece quando há `detail` (`app/assistant.tsx:262-269`), com rótulo
  `t.app.assistant.why` (`'POR QUÊ?'` / `'WHY?'` / `'¿POR QUÉ?'`) alternando para
  `t.app.assistant.close` (`'FECHAR'` / `'CLOSE'` / `'CERRAR'`).
- Ao lado dele, quando há `route`, o botão `t.app.assistant.openScreen`
  (`'ABRIR A TELA'` / `'OPEN THE SCREEN'` / `'ABRIR LA PANTALLA'`), que faz
  `router.push(turn.answer.route as never)`.
- Os dois botões são `variant="ghost"` (`app/assistant.tsx:266`, `:274`), por decisão de
  desenho registrada no comentário 256-259: *"as duas são fantasma: abrir a conta e abrir a
  tela não são o que se faz aqui — o que se faz aqui é perguntar de novo."*

#### O componente `WhySheet` — a outra folha, que o assistente NÃO usa

`src/components/WhySheet.tsx` existe e é a folha do `[por quê?]` **da tela de receita**. Seu
único chamador é `app/recipes/[id].tsx`. Ela recebe `cost: RecipeCost` e desenha:

- as linhas ordenadas por `share` decrescente, com `formatMoney(line.totalCents)` e uma
  **barra** de largura `Math.max(1, Math.round(line.share * 100))%` (`WhySheet.tsx:78-87`) —
  *"a barra é o ponto: ela mostra o que domina o custo de relance"*;
- a legenda `t.whySheet.shareOfBatch` (`'{{percent}} do lote'`);
- três resumos: `t.whySheet.batchCost` (`'Custo do lote'`) → `formatMoney(cost.batchCents)`;
  `t.whySheet.expectedLoss` (`'Perda prevista ({{percent}})'`) → `t.whySheet.remains`
  (`'sobram {{amount}}'`) com `formatQuantity(cost.netYield)`; e `t.whySheet.perMassUnit`
  (`'Custo por unidade de massa'`) → `t.whySheet.perAmount` (`'{{money}} / {{amount}}'`) com
  `formatMoney(Math.round(cost.perYieldUnit * 1000))` e `formatQuantity(1000)`;
- o rodapé `t.whySheet.lossNote`: *"A perda encarece o que sobra: o lote é pago inteiro, mas
  só parte dele chega ao cliente."*

Docblock (`WhySheet.tsx:9-20`), traduzido: *"A lei que ela serve: nenhuma conclusão neste app
é inauditável. Para alguém que ainda não confia software com o dinheiro dele, poder abrir a
aritmética é o que transforma 'o app disse' em 'o app está certo' — e isso só é possível
porque o número veio de matemática determinística sobre o livro-razão, e não de um chute. Ela
sobe de baixo, como toda escolha neste app; um diálogo centralizado é reservado a ações
destrutivas."*

O dicionário `whySheet` está nos três idiomas (`src/i18n/locales/pt-BR.ts:1068-1079`, e
equivalentes em `en.ts` e `es.ts`), com um docblock (`pt-BR.ts:1059-1067`) registrando por que
foi traduzido: *"Ela é a Lei 6 em pessoa (…) e estava com o texto cravado em português
enquanto o resto do aplicativo já falava três."*

**Resumo do estado:** há **dois** mecanismos de `[por quê?]` no produto — a folha modal
`WhySheet` (usada só pela tela de receita, com barras e três resumos) e a lista embutida da
tela do assistente (`ListRow` alternada por `turn.open`). O assistente **não** importa
`WhySheet`.

---

### 22.10 A tela `app/assistant.tsx` — "Modo Conversa"

**Estado: implementado e alcançável** (`app/(tabs)/more.tsx:129`).

Docblock (`app/assistant.tsx:21-34`), traduzido: *"Não é uma versão reduzida do app — é outra
porta para a mesma casa, com os mesmos dados, as mesmas permissões e as mesmas ações. Existe
porque a pessoa dona da fábrica não deveria ter de aprender a navegar: ela pergunta. Três
regras a sustentam, e são visíveis nesta tela: todo número mostrado aqui foi calculado pelo
motor, e `[por quê?]` abre a aritmética que o produziu; uma frase que gravaria alguma coisa
preenche um cartão e espera, e nada chega ao livro-razão sem um sim humano; o que a pessoa
não pode ver nunca é buscado, então não há nada para vazar."*

O docblock segue com o registro de uma reescrita inteira na "língua da capa"
(`docs/linguagem.md`), listando item por item o que saiu: um `TextInput` cru desenhado à mão,
os exemplos numa fita horizontal de pastilhas (*"dezesseis coisas que o assistente sabe
responder, treze delas fora do quadro"*), `[por quê?]`/`ABRIR A TELA` como pílulas de
`StyleSheet` local, e a conta como grade de `View` com `flex: 1` e `tabular-nums` na mão
(`app/assistant.tsx:35-61`).

#### Estrutura

```tsx
export default function AssistantScreen() {          // app/assistant.tsx:63-69
  return <AreaProvider area="sky"><Conversation /></AreaProvider>;
}

const CAPABILITIES: ReadonlySet<Capability> = capabilitiesFor('owner');   // linha 79
```

Sobre `CAPABILITIES` (`app/assistant.tsx:71-78`), traduzido: *"Até o login chegar, quem
segura este celular é o dono. O conjunto vem da tabela de papéis em vez de ser digitado aqui,
e esse é o ponto: no dia em que isto ler uma associação de verdade, só esta linha muda. Uma
lista escrita à mão ao lado de uma tabela de papéis é duas respostas para uma pergunta, e a
escrita à mão já estava faltando três capacidades que o dono tem."*
`capabilitiesFor('owner')` devolve **todas as doze** capacidades
(`src/domain/access.ts:72`, `ROLES.owner = capabilities`).

Estado do componente (`app/assistant.tsx:92-94`): `question` (string), `turns` (`Turn[]`),
`thinking` (boolean).

Contexto (`app/assistant.tsx:96-103`), memoizado por `locale.timeZone`:

```ts
{
  data: liveData(LOCAL_COMPANY_ID, locale.timeZone),
  capabilities: CAPABILITIES,
  locale: defaultLocale,
}
```

`examples = knownSkills(CAPABILITIES).map(s => s.example)` (`app/assistant.tsx:105`) —
para o dono, **as dezessete frases de exemplo**.

#### `send(text)` — `app/assistant.tsx:107-134`

Ignora vazio e ignora chamada enquanto `thinking`. Limpa o campo, liga `thinking`, chama
`ask(asked, context)` e insere o turno **no topo** da lista
(`[novo, ...prev]`). No `catch`, insere um turno cujo texto é
`fill(t.app.assistant.trouble, { error })` — `'Deu problema aqui: {{error}}'`. No `finally`,
desliga `thinking`.

#### `confirmDraft(index)` — o piso, `app/assistant.tsx:139-163`

```ts
const go = await askConfirm({
  title: t.app.assistant.confirmTitle,     // 'Confirma?'
  message: turn.answer.draft.summary,      // o resumo por extenso, da habilidade
  cancelLabel: t.app.assistant.no,         // 'Não'
});
if (!go) return;
```

Comentário nas linhas 143-144: *"O piso que nenhum nível de autonomia atravessa: um preço, um
ajuste ou um lançamento financeiro é confirmado por uma pessoa, em palavras, toda vez."*
Sucesso: marca `applied: true`. Falha: reabre o diálogo em modo `acknowledge: true` com
`title: t.app.assistant.failed` (`'Não deu para gravar'`) e
`confirmLabel: t.app.confirm.understood`.

Esse piso corresponde a `ALWAYS_CONFIRMED` em `src/domain/access.ts:135-141`:
`['adjustStock', 'changePrice', 'reverseMovement', 'recordFinance', 'issueInvoice']`, com
`needsHumanYes(act)` devolvendo sempre `true` (linhas 146-148).

#### Layout, na ordem em que se usa

1. **Perguntar** (`app/assistant.tsx:171-186`): `Card` com `hue={palette.sky}` e ícone
   `GlyphAssistant`, dentro dele um `Field` (`label: 'Sua pergunta'`,
   `placeholder: 'quanto custa o picolé de morango'`) e um `Button`
   (`'Perguntar'` / `'Vendo…'` enquanto pensa), desabilitado com campo vazio.
2. **O que se pode perguntar** (`app/assistant.tsx:194-205`): renderizado **só quando
   `turns.length === 0`** — é o estado vazio. Sobrelinha
   `t.app.assistant.examplesTitle.toLocaleUpperCase(locale.formatting)`
   (`'Eu sei responder, por exemplo'`) e uma `ListRow` por exemplo, **cada uma mandando a
   própria frase** (`onPress={() => send(example)}`). Comentário: *"a lista não ensina: ela
   responde."*
3. **As respostas** (`app/assistant.tsx:212-323`), da mais nova para a mais velha. Cada turno
   é um `Card` com `hue={turn.answer.draft ? color.warning : palette.sky}` — âmbar quando há
   rascunho esperando decisão, azul quando é só resposta. Dentro: a pergunta em
   `type.caption`/`color.inkFaint`, o `answer.text` em `type.cardTitle`, a `list` sempre
   aberta, a `detail` atrás do `[por quê?]`, os dois botões fantasma, e o cartão de rascunho.
4. **O rascunho** (`app/assistant.tsx:286-320`): quando `turn.applied`, um `Chip`
   `signal="ok"` com rótulo `t.app.assistant.registered` (`'Cadastrado.'`) se
   `draft.kind === 'item'`, senão `t.app.assistant.recorded` (`'Lançado.'`). Quando ainda não
   aplicado, o `draft.summary` em `type.body` e um `Button weighty` com
   `t.app.assistant.confirmAndRegister` (`'Confirmar e cadastrar'`) ou
   `t.app.assistant.confirmAndRecord` (`'Confirmar e lançar'`). Comentário nas linhas
   302-307: *"Lançar é o que se faz com o que aconteceu, e o cadastro de um insumo não
   aconteceu em lugar nenhum: `saveItem` escreve a linha do item e nenhum movimento."*

#### O dicionário da tela — `t.app.assistant`, nos três idiomas

| chave | pt-BR | en | es |
|---|---|---|---|
| `title` | Pergunte | Ask | Pregunta |
| `overline` | modo conversa | conversation mode | modo conversación |
| `placeholder` | quanto custa o picolé de morango | what does the strawberry popsicle cost | cuánto cuesta la paleta de frutilla |
| `inputLabel` | Sua pergunta | Your question | Tu pregunta |
| `ask` | Perguntar | Ask | Preguntar |
| `thinking` | Vendo… | Looking… | Viendo… |
| `examplesTitle` | Eu sei responder, por exemplo | I can answer, for example | Sé responder, por ejemplo |
| `why` | POR QUÊ? | WHY? | ¿POR QUÉ? |
| `close` | FECHAR | CLOSE | CERRAR |
| `openScreen` | ABRIR A TELA | OPEN THE SCREEN | ABRIR LA PANTALLA |
| `recorded` | Lançado. | Recorded. | Registrado. |
| `confirmAndRecord` | Confirmar e lançar | Confirm and record | Confirmar y registrar |
| `registered` | Cadastrado. | Added. | Dado de alta. |
| `confirmAndRegister` | Confirmar e cadastrar | Confirm and add | Confirmar y dar de alta |
| `confirmTitle` | Confirma? | Confirm? | ¿Confirmas? |
| `no` | Não | No | No |
| `failed` | Não deu para gravar | Could not record | No se pudo grabar |
| `trouble` | Deu problema aqui: `{{error}}` | Something went wrong here: `{{error}}` | Hubo un problema aquí: `{{error}}` |

(`src/i18n/locales/pt-BR.ts:1028-1048`, `src/i18n/locales/en.ts:944-963`,
`src/i18n/locales/es.ts:950-969`.) Havia uma seção `assistant` de nível superior morta no
dicionário (`assistant.title: 'Modo Conversa'`), removida dos três idiomas —
`docs/insights.md:2567`.

---

### 22.11 O rastro: `assistant_phrase`

A condição que o plano impôs para deixar o assistente escrever.

- **Servidor:** `movements.assistant_phrase text`
  (`supabase/migrations/0001_foundation.sql:214`), com comentário nas linhas 211-213:
  *"Preenchido quando o assistente rascunhou este movimento, guardando a frase que a pessoa
  de fato digitou. Torna respondível 'o que o assistente lançou este mês?'. Autonomia sem
  rastro é o que quebra a confiança no dado."*
- **Índice dedicado:** `create index movements_assistant_idx on movements (company_id,
  recorded_at) where assistant_phrase is not null;`
  (`supabase/migrations/0001_foundation.sql:230-231`).
- **Aparelho:** `assistant_phrase TEXT` (`src/data/db.ts:247`).
- **Vocabulário do domínio:** `assistantPhrase?: string` em `src/domain/ledger.ts:124`.
- **Escritores no repositório** (o `INSERT` cita a coluna e passa
  `input.assistantPhrase ?? null`): compra (`src/data/repository.ts:405`, `421`), contagem
  (`948`, `966`), produção (`1535`, `1550`), transferência (`1716`, `1735`), perda (`2136`,
  `2158`), e mais um caminho em `2495`/`2509`.
- **Caminho completo:** `ask` injeta `question: trimmed` no contexto
  (`src/assistant/index.ts:72`) → a habilidade põe `assistantPhrase: ctx.question` no `apply`
  → `liveData` repassa → o repositório grava.

Quatro das dezessete habilidades escrevem, e as quatro carimbam a frase:
`register_purchase` (`skills.ts:377`), `register_count` (`skills.ts:599`),
`register_production` (`skills.ts:886`), `register_transfer` (`skills.ts:963`).

**Exceção factual:** `register_input` chama `saveItem`, que escreve a linha do item e
**nenhum movimento** — não há `assistantPhrase` ali (`skills.ts:678-686`), e não há coluna
equivalente na tabela `items`. Um insumo criado por conversa é hoje indistinguível de um
criado pela tela. NÃO IMPLEMENTADO.

Essa coluna foi durante um tempo o exemplo canônico de "peça com índice e sem escritor" do
projeto (`docs/insights.md:934-949`); ganhou escritor e saiu da lista
(`docs/insights.md:2591`).

---

### 22.12 O que é determinístico e o que dependeria de rede

#### Determinístico e local — tudo o que existe hoje

Nenhuma linha do assistente faz requisição de rede. O caminho inteiro é:

| Camada | Onde roda | Natureza |
|---|---|---|
| Casamento da pergunta | `Array.prototype.match` sobre string normalizada | 17 expressões regulares no arquivo, nenhuma compilada em tempo de execução a partir de dado |
| Resolução de nome | `findByName`/`namesakes` sobre a lista já carregada | comparação de strings |
| Leitura de números | `parseTyped` | aritmética sobre string |
| Consulta | SQLite no aparelho, via as funções de `src/data/repository.ts` | `src/data/db.ts:1-14` — banco local que espelha o esquema do servidor |
| Cálculo de custo | `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit`, `shoppingList` | funções puras de `src/domain/recipe.ts` |
| Janela de dia | `dayWindow`/`localDate` com `Intl.DateTimeFormat` | `src/domain/day.ts` — sem rede |
| Formatação | `Intl.NumberFormat`/`Intl.DateTimeFormat` | `src/i18n/index.ts` |
| Escrita | `INSERT` no SQLite local, enfileirado para sincronização depois | `src/data/repository.ts` |

O único não-determinismo é o **relógio**: `nowIso()` (`src/data/db.ts:849-851`) alimenta
`produced_today` e `what_was_lost`. O dublê dos testes contorna isso respondendo por **ordem
de chamada** em vez de por data (`assistant.test.ts:191-201`, `231`), com a razão escrita:
*"A primeira versão indexava por 'hoje em UTC' e a habilidade pergunta pela janela do fuso da
FÁBRICA — para São Paulo o dia começa às 03:00Z do dia anterior (…). O teste passava pelo
horário em que rodava."*

Consequência declarada (`src/assistant/text.ts:1-8`): funciona na câmara fria e na rota de
entrega, e **responde instantaneamente**.

#### O que dependeria de rede — planejado, NÃO IMPLEMENTADO

O código nomeia exatamente uma peça futura de rede, em três lugares, e sempre com a mesma
forma:

1. `src/assistant/index.ts:18-21`: *"quando um modelo de linguagem fizer o casamento, ele
   mapeia qualquer fraseado para uma habilidade e seus campos"* — e as respostas migram para
   o dicionário na mesma mudança.
2. `src/assistant/index.ts:50-52`: *"Quando um modelo de linguagem for acrescentado, ele fica
   **na frente** desta função, escolhendo uma habilidade e seus campos. Ele nunca alcança o
   dado, e nunca produz um número."*
3. `src/assistant/types.ts:24-26`: *"Quando um modelo de linguagem for acrescentado ele
   mapeará fraseado para uma habilidade e seus campos — nada além disso. Ele continua
   intérprete, nunca contador."*

O contrato do modelo futuro, portanto, já está escrito: **entrada** = a frase;
**saída** = `{ skillId, slots }`; **nunca** SQL, nunca número, nunca escrita. Tudo abaixo de
`ask` continua determinístico e offline, e o modelo é um degradável — sem rede, o casamento
por expressão regular continua respondendo as perguntas que ele conhece.

Não há, hoje: chamada HTTP, chave de API, prompt, `fetch`, nem qualquer dependência de
serviço externo em `src/assistant/`. NÃO IMPLEMENTADO.

---

### 22.13 O que os testes seguram

`src/assistant/assistant.test.ts` (789 linhas). Docblock (linhas 18-23), traduzido: *"O
assistente é a parte deste app mais capaz de destruir confiança, porque ele fala em frases e
frases soam certas. Estes testes o prendem às duas promessas que o tornam seguro: ele nunca
inventa um número, e nunca escreve nada que uma pessoa não confirmou."*

**Os dublês** (`assistant.test.ts:25-262`): dois itens (`pulp` — Polpa de morango, balde 10 kg,
`purchaseToBase` 10.000, `averageRate` `rate(12.4, 1_000)` = 1,24 c/g, 40.000 g em mão; e
`sugar` — Açúcar cristal, saco 25 kg, 25.000, `rate(4.72, 1_000)` = 0,472 c/g, 50.000 g), um
produto (`p1` Picolé de morango, receita `popsicle`, `yieldPerUnit` 75,
`unitPackagingCents` `fromDecimal(0.05)` = 5), uma receita (`yieldAmount` 40.000 ml,
`lossFraction` 0,05, 18.000 de polpa e 6.000 de açúcar) e dois lugares (`factory` com
`name: ''` e `isDefault: true`; `centro` "Loja Centro"). `recorded: unknown[]` registra toda
tentativa de escrita — *"para que uma escrita silenciosa não possa se esconder"* (linha 188).

O comentário das linhas 138-147 registra um bug de dublê que custou caro: as somas por lugar
**têm** de fechar com o total da empresa (44.000 + 6.000 = 50.000). Antes eram 50.000 + 6.000
contra um total de 50.000 — *"um mundo impossível, e foi ele que deixou a contagem falada
comparar o total da empresa com a prateleira de uma sala sem nenhum teste reclamar."*

| Teste | Linha | O que trava |
|---|---|---|
| o número da resposta é o que o motor calculou | 270 | R$ 0,55 = (18.000×1,24 + 6.000×0,472) ÷ 38.000 × 75 + 5 |
| papel sem `view_cost` não extrai número | 280 | `answer.detail === undefined` **e** `doesNotMatch(text, /\d/)` |
| registrar falando produz rascunho, nunca escrita | 289 | `recorded.length === 0` antes do `apply`, e o objeto exato depois, com `assistantPhrase` |
| "nada mudou" dito claramente | 313 | `/estável/`, `detail === undefined` |
| o que moveu é ordenado por quanto moveu | 321 | `/subiu 7,8%/`, `detail.length === 1` |
| pergunta desconhecida oferece o que ele sabe | 329 | `list` não vazia, `detail === undefined` |
| os exemplos nunca incluem o que o papel não pode | 340 | conta primeiro, depois `doesNotMatch(/custa|preço/)` |
| lista o almoxarifado com o dinheiro parado | 350 | R$ 732,00 |
| plano vira lista de compras | 361 | 3 tachos → `faltam 14.000 g`, `precisa 54.000, tem 40.000` |
| a lista de compras não é do celular emprestado | 380 | recusa **antes** da consulta |
| apagar recebe direções, nunca apagamento | 389 | `draft === undefined` |
| diz quanto tem e quando conferiram | 398 | `/conferido em 20\/08/` |
| prateleira nunca contada diz isso | 410 | `/Ninguém conferiu a prateleira ainda/` |
| quantidade não é segredo; valor é | 417 | operador vê 50.000 g e não vê `Valor parado` |
| contar falando preenche e para | 429 | dois casos (bate / falta 10.000 g) e o objeto gravado |
| item em duas salas não é contado falando | 460 | sem rascunho, `/2 lugares/`, `/Fábrica/`, `route: '/inputs/sugar'` |
| contagem recusada a quem não ajusta estoque | 477 | sem rascunho |
| acha o item pela palavra que se digita | 485 | acento não importa |
| palavra que alcança a grade inteira não elege ninguém | 505 | `findByName → null`, `namesakes → ['pote','picole']` |
| responde o que a capa mostra | 529 | vazio e cheio, com `180 a mais` |
| lê número como foi digitado | 554 | os oito casos de `parseTyped` |
| insumo criado falando, embalagem lida | 579 | `purchaseToBase: 10_000` |
| embalagem ilegível ainda cria e avisa | 599 | `purchaseToBase === null` |
| criar o que já existe aponta para ele | 611 | sem rascunho |
| criar insumo é ato de `manage_company` | 620 | sem rascunho |
| lugar perguntado por nome; padrão responde a "fábrica" | 626 | inclui a frase ambígua `quanto tem na loja centro` |
| quanto vale um lugar obedece ao papel | 651 | `Valor parado` só com `view_cost` |
| onde está uma coisa lê a mesma soma pelo outro eixo | 662 | `[{Fábrica, 44.000 g}, {Loja Centro, 6.000 g}]` |
| produzir falando conta pelo que saiu, e diz | 672 | aplica o rascunho e confere `batches === 480/506` |
| carga recusada antes de preparada | 721 | `Tem só 44.000 g`, `route: '/places'`, e o objeto gravado |
| produzir e despachar são permissões próprias | 752 | cruzado |
| o que se perdeu nomeia o motivo que domina | 759 | R$ 100,00 e `vencida`, **não** `derretida` |
| nada perdido é resposta | 778 | sem `R$` no texto |
| quem não vê custo não pergunta o que se perdeu | 785 | sem `R$` |

#### As mutações que provam que a suíte morde

`scripts/mutate.mjs` carrega catorze mutações que tocam o assistente. Cada uma quebra uma
regra de propósito e declara o dano em `hurts`:

| Alvo | Troca | Dano declarado |
|---|---|---|
| `skills.ts` (batches) | `declarados ?? (porTacho > 0 ? units / porTacho : 0)` → `declarados ?? 1` | *"o assistente volta a debitar um tacho inteiro por qualquer quantidade dita, e a polpa some do papel sem sair da prateleira"* |
| `text.ts` (empate) | `return null` → devolve o nome mais curto | *"'morango' alcança doze produtos e o assistente grava calado contra o de nome mais curto"* |
| `skills.ts` (perda) | soma por motivo → `Math.max` | *"aponta a maior perda isolada como causa, e manda olhar o freezer quando quem come o mês é a validade"* |
| `index.ts` (permissão) | `if (skill.requires && !...has(...))` → `if (false)` | *"o assistente entrega custo a quem não pode ver custo"* |
| `skills.ts` (duplicado) | comparação exata → `findByName` | *"cadastrar polpa de açaí é recusado porque já existe polpa de morango"* |
| `skills.ts` (match cru) | `q.match(...)` → `normalize(q).match(...)` | *"o insumo entra no catálogo sem acento — 'polpa de acai' — e fica assim para sempre"* |
| `skills.ts` (carimbo) | `assistantPhrase: ctx.question` → `undefined` | *"'o que ele lançou este mês?' deixa de ter resposta"* |
| `skills.ts` (ordem) | `stockAtPlace, whereIsItem, stockOfInput` → `stockOfInput` primeiro | *"'quanto tem na loja centro' vira procura por um insumo chamado 'na loja centro'"* |
| `skills.ts` (saldo) | `if (amount > held)` → `if (amount > held * 1000)` | *"o rascunho da carga é preparado sem ter o que mandar, e só falha na hora de gravar"* |
| `skills.ts` (aviso) | o sufixo `' Contei os insumos pelo que saiu…'` → `''` | *"conta pelo que saiu e não diz"* |
| `skills.ts` (papel) | `requires: 'record_production'` → `'dispatch'` | *"quem só pode despachar passa a poder gravar produção"* |
| `skills.ts` (duas salas) | `if (holding.length > 1)` → `> 99` | *"a mesma teleportação que a tela tinha, agora por voz"* |
| `measure.ts` | `matches.length !== 1` → `=== 0` | *"'caixa 6 x 500 ml' é lido como 6 ml, e o custo do insumo sai cem vezes errado"* |
| `money.ts` | `Math.round` → `Math.floor` em `amountOf` | *"todo custo sai um pouco baixo, sempre para o mesmo lado"* |

A rota `/assistant` também está na lista de telas do `e2e` (`scripts/shot.mjs:63`).

---

### 22.14 Estado de cada peça, explicitamente

| Peça | Estado |
|---|---|
| As 17 habilidades de `phase1Skills` | **implementadas e alcançáveis por tela** — todas aparecem na lista de exemplos e todas são atingíveis por `ask` |
| `ask`, `knownSkills` | **implementados e chamados por tela** (`app/assistant.tsx:105`, `:114`) |
| `registerSkills` | **implementado, sem chamador** — o registro nunca cresce em produção |
| `Draft.kind` | **implementado e lido**, mas só o valor `'item'` muda alguma coisa; os outros quatro são indistinguíveis na tela |
| `Answer.list` | **implementado e renderizado** (`app/assistant.tsx:228-239`) |
| `Answer.detail` | **implementado e renderizado atrás do `[por quê?]`** |
| `Answer.route` | **implementado e renderizado**; as dez rotas existem |
| `assistant_phrase` | **coluna, índice e escrita completos** para os quatro caminhos que geram movimento |
| `assistant_phrase` para `saveItem` | **NÃO IMPLEMENTADO** — não há coluna equivalente em `items` |
| `WhySheet` (componente) | **implementado, chamado só por `app/recipes/[id].tsx`** — o assistente não o usa |
| Tradução das respostas do assistente | **NÃO IMPLEMENTADO, por decisão registrada** (§22.1) |
| Modelo de linguagem na frente de `ask` | **planejado, escrito em três docblocks, NÃO IMPLEMENTADO** |
| Rede, em qualquer forma, dentro de `src/assistant/` | **NÃO EXISTE** |
| Criação de insumo em `ml`/`un` pelo assistente | **NÃO IMPLEMENTADO** — `baseUnit` é `'g'` cravado (`skills.ts:655`) |
| Fornecedor na compra falada | **NÃO IMPLEMENTADO** — `AssistantData.recordPurchase` aceita `supplierName?`, e `register_purchase` nunca o passa |
| Perda registrada falando | **NÃO IMPLEMENTADO** — `what_was_lost` lê perdas; não existe habilidade que as escreva, embora `recordLoss` exista no repositório |
| Devolução, pedido, separação, conferência faladas | **NÃO IMPLEMENTADO** — não há habilidade para nenhum deles |
