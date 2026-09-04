## 23. Avisos locais e clima

Dois assuntos que dividem a mesma cicatriz: são as duas únicas partes do
aplicativo que dependem de algo fora dele — o sistema operacional do aparelho
(notificação) e a internet (previsão) — e as duas foram construídas para que a
falha do lado de fora **não apareça como falha do lado de dentro**.

---

### 23.1 Inventário: cada peça e o estado dela

| Arquivo | O que é | Estado |
|---|---|---|
| `src/domain/alerts.ts` (352 linhas) | A regra: o que merece aviso, com que antecedência, em que hora, em que dias | **Implementado e chamado** (por `src/notify/index.ts:87,92,94` e `app/settings.tsx:253`) |
| `src/notify/facts.ts` (126 linhas) | Lê o livro-razão e monta o `AlertFacts` | **Implementado e chamado** (`src/notify/index.ts:86`) |
| `src/notify/phrase.ts` (51 linhas) | Transforma um `Alert` em `{title, body}` nos três idiomas | **Implementado e chamado** (`src/notify/Alerts.tsx:31`) |
| `src/notify/index.ts` (112 linhas) | O adaptador: permissão, cancelamento e agendamento no SO | **Implementado e chamado** (`src/notify/Alerts.tsx:3,31`) |
| `src/notify/Alerts.tsx` (41 linhas) | O chamador. Não desenha nada | **Implementado e montado** em `app/_layout.tsx:119` |
| `src/weather/index.ts` (251 linhas) | A regra do clima: cidade, cache, validade, leitura do dia | **Implementado e chamado** (`src/weather/live.ts:50`, `app/weather.tsx:76`) |
| `src/weather/live.ts` (59 linhas) | `fetch` com prazo + cache em `app_meta` | **Implementado e chamado** (`app/(tabs)/index.tsx:282`, `app/weather.tsx:13`) |
| `src/components/Sky.tsx` (263 linhas) | Faixa de temperatura → cor → desenho (selo e régua) | **Implementado e chamado** (`src/home/Mosaic.tsx:13,59,305,308,330`) |
| `src/components/Landscape.tsx` (194 linhas) | A cena da capa no tema Orgânico, movida pela previsão | **Implementado e chamado** (`src/home/Mosaic.tsx:121,896`) |
| `app/weather.tsx` (198 linhas) | Tela de escolher a cidade | **Implementado**, alcançável pelo menu `/more` (`app/(tabs)/more.tsx:102`) |
| `src/notify/facts.test.ts`, `src/notify/phrase.test.ts`, `src/weather/weather.test.ts`, `src/domain/alerts.test.ts` | A rede de testes | **Implementados** |

**Não existe teste do adaptador** (`src/notify/index.ts`) — e isso é escrito no
próprio arquivo: *"Esta é a única camada do assunto que um teste desta máquina
NÃO prova"* (`src/notify/index.ts:9-12`). **Não existe teste de
`src/components/Sky.tsx`** — a única `.test.` em `src/components/` é
`confirm.test.ts`.

---

## PARTE A — AVISOS

### 23.2 A separação em quatro camadas, e por que ela existe

A cadeia completa, em ordem de chamada:

```
app/_layout.tsx:119  <Alerts />
  └─ src/notify/Alerts.tsx:31  rescheduleAlerts(locale.timeZone, alert => alertPhrase(alert, t))
       ├─ src/notify/index.ts:85   alertSettings()            → src/data/repository.ts:3939
       ├─ src/notify/index.ts:86   factsForAlerts(timeZone)   → src/notify/facts.ts:28
       ├─ src/notify/index.ts:87   alertsDue(facts, settings) → src/domain/alerts.ts:236
       ├─ src/notify/index.ts:92   nextAlertAt(settings, now) → src/domain/alerts.ts:337
       ├─ src/notify/index.ts:94   alertsRunToday(...)        → src/domain/alerts.ts:324
       ├─ src/notify/index.ts:101  phrase(avisos[0])          → src/notify/phrase.ts:20
       └─ src/notify/index.ts:102  lib.scheduleNotificationAsync(...)
```

Cada corte tem um motivo registrado no código:

- **Regra fora do adaptador.** `src/notify/index.ts:14-16`: *"A separação é
  deliberada e tem precedente nesta base: o `pickSuggestion` viveu dentro de um
  componente e o `mutate` não alcançava a regra. Regra que mora no adaptador é
  regra sem rede."*
- **Fatos fora do adaptador.** `src/notify/facts.ts:18-24`: os fatos moravam no
  mesmo arquivo do agendador, e o teste não os alcançava porque o adaptador
  importa `react-native` (`src/notify/index.ts:1`) e um teste de Node não
  transforma esse pacote. O defeito que forçou a separação foi
  `placeId: d.itemId` — item passando por loja.
- **Frase fora do componente.** `src/notify/phrase.ts:6-18` e
  `src/notify/Alerts.tsx:18-21`: a frase nasceu dentro do componente que agenda;
  fora dele três coisas passam a ser conferíveis — nenhum buraco `{{...}}` sobra,
  a unidade acompanha o número, e os três idiomas respondem.
- **Diagnóstico é código, não frase.** `src/notify/index.ts:26-33`: a primeira
  versão devolvia português ("permissão negada") e o guard de frase reprovou —
  *"a camada de dados devolve fato, não frase"*.

### 23.3 O chamador: `Alerts.tsx`

Componente sem desenho: `return null` (`src/notify/Alerts.tsx:40`).

- Lê `const { locale, t } = useLocale()` (`src/notify/Alerts.tsx:24`).
- Dentro de `useEffect` chama
  `void rescheduleAlerts(locale.timeZone, (alert) => alertPhrase(alert, t))`
  (`src/notify/Alerts.tsx:31`).
- Dependências do efeito: `[locale.timeZone, t]` (`src/notify/Alerts.tsx:38`) —
  ou seja, **reagenda a cada abertura do aplicativo e a cada troca de idioma ou
  de fuso**, nunca por temporizador.
- Guarda de vida: `let vivo = true` … `return () => { vivo = false }`
  (`src/notify/Alerts.tsx:27,35-37`). O resultado da promessa é descartado — o
  `then` só checa `vivo` e não faz nada (`src/notify/Alerts.tsx:31-33`).
- Por que "abrir" é o gancho e não um relógio: *"o dado muda quando alguém
  registra alguma coisa, e quem registra abre o aplicativo"*
  (`src/notify/Alerts.tsx:14-16`).
- Está montado dentro de `ConfirmProvider`, acima de todas as telas
  (`app/_layout.tsx:119`), com o comentário que explica que ele existe para a
  regra ter chamador (`app/_layout.tsx:115-118`).

### 23.4 O agendador: `rescheduleAlerts`

Assinatura literal (`src/notify/index.ts:71-75`):

```ts
export async function rescheduleAlerts(
  timeZone: string,
  phrase: (alert: Alert) => { title: string; body: string },
): Promise<{ scheduled: boolean; reason?: NotScheduled; detail?: string }>
```

Sequência exata:

1. `const lib = await biblioteca()` — se nulo, `{ scheduled: false, reason: 'sem-suporte' }` (`src/notify/index.ts:76-77`).
2. `const permissao = await lib.getPermissionsAsync()` (`:80`); concedida =
   `permissao.granted || (await lib.requestPermissionsAsync().then(p => p.granted))` (`:81-82`).
   Negada ⇒ `reason: 'sem-permissao'` (`:83`).
3. `const settings = await alertSettings()` (`:85`).
4. `const facts = await factsForAlerts(timeZone)` (`:86`).
5. `const avisos = alertsDue(facts, settings)` (`:87`).
6. `await lib.cancelAllScheduledNotificationsAsync()` (`:89`) — **cancela antes
   de decidir**, para que "nada a avisar" também limpe a bandeja.
7. `avisos.length === 0` ⇒ `reason: 'nada-a-avisar'` (`:90`).
8. `const quando = nextAlertAt(settings, new Date())` (`:92`); nulo ⇒
   `reason: 'sem-dia-alcancavel'` (`:93`).
9. `!alertsRunToday(settings, quando.getDay())` ⇒ `reason: 'fora-dos-dias'` (`:94-96`).
10. `const { title, body } = phrase(avisos[0])` (`:101`) — **um aviso, não sete**:
    *"a bandeja com sete linhas do mesmo aplicativo é a bandeja que a pessoa limpa
    sem ler. O mais urgente já vem primeiro do domínio, e os outros continuam na
    capa, que é onde eles se comparam"* (`:98-100`).
11. Agenda (`:102-105`):

```ts
await lib.scheduleNotificationAsync({
  content: { title, body, data: { kind: avisos[0].kind, subjectId: avisos[0].subjectId } },
  trigger: { channelId: CANAL, date: quando },
});
```

12. `return { scheduled: true }` (`:107`).
13. Qualquer exceção cai em `catch` ⇒
    `{ scheduled: false, reason: 'falhou', detail: e instanceof Error ? e.message : String(e) }`
    (`:108-111`), com o comentário *"Falhar aqui é perder um aviso; derrubar a
    tela é perder a fábrica"* (`:109`).

**A constante do canal:** `const CANAL = 'norva-avisos'` (`src/notify/index.ts:43`),
descrita como *"um identificador estável, para reagendar sem duplicar"* (`:42`).
Ela é usada apenas como `trigger.channelId`. **NÃO ESTÁ NO CÓDIGO** nenhuma
chamada a `setNotificationChannelAsync` — o canal Android nunca é criado por este
repositório. Também **NÃO ESTÁ NO CÓDIGO** nenhuma chamada a
`setNotificationHandler`.

**Carregamento tardio da biblioteca** (`src/notify/index.ts:45,54-61`):

```ts
type Notificacoes = typeof import('expo-notifications');

async function biblioteca(): Promise<Notificacoes | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}
```

Motivo escrito (`:48-53`): *"`expo-notifications` no navegador precisa de push com
service worker, que é outro produto — e o e2e roda no navegador. Importar no topo
faria a suíte inteira carregar um módulo que ela não pode exercitar."*

#### Os códigos de "não agendou"

`export type NotScheduled` (`src/notify/index.ts:34-40`) — seis valores, todos
em kebab-case português, **códigos e não frases**:

| Valor | Quando | Linha |
|---|---|---|
| `'sem-suporte'` | web, ou `expo-notifications` ausente/falhou ao importar | `src/notify/index.ts:77` |
| `'sem-permissao'` | o SO não concedeu permissão de notificação | `:83` |
| `'nada-a-avisar'` | `alertsDue` devolveu lista vazia | `:90` |
| `'sem-dia-alcancavel'` | `nextAlertAt` não achou instante futuro em 8 dias | `:93` |
| `'fora-dos-dias'` | o dia encontrado não está nos dias combinados | `:95` |
| `'falhou'` | qualquer exceção; vem com `detail` | `:110` |

**Nenhum desses códigos é lido por tela alguma.** `NotScheduled` só aparece em
`src/notify/index.ts:34,75` (busca em `src`, `app`, `e2e`, `scripts`), e
`Alerts.tsx` descarta o resultado (`src/notify/Alerts.tsx:31-33`). O dicionário
tem a frase pronta para o caso da permissão negada —
`t.app.settings.alerts.never` (`src/i18n/locales/pt-BR.ts:497`,
`en.ts:441`, `es.ts:446`) — e ela **não tem chamador**: é o caso
"implementado mas sem leitor".

### 23.5 A configuração: `AlertSettings`

Tipo completo (`src/domain/alerts.ts:33-106`):

| Campo | Tipo | Semântica | Linha |
|---|---|---|---|
| `on` | `Record<AlertKind, boolean>` | ligado por alarme; desligado é escolha legítima | `:35` |
| `daysAhead` | `Record<Exclude<AlertKind,'volume'\|'ambiente'>, number>` | dias de antecedência de `insumo`, `pedido`, `validade` | `:44` |
| `bands.red` | `number` | **teto**: até este % é vermelho | `:61` |
| `bands.yellow` | `number` | **teto**: até este % é amarelo | `:62` |
| `bands.blue` | `number` | **piso**: acima deste % é azul | `:63` |
| `bands.notifyFull` | `boolean` | se o azul interrompe ou só pinta | `:78` |
| `minuteOfDay` | `number` | minuto do dia, 0 a 1439 — hora **e** minuto num só fato | `:97` |
| `weekdays` | `number` | bitmask, bit 0 = domingo; **zero significa TODOS** | `:105` |

`AlertKind` (`src/domain/alerts.ts:30`):
`'insumo' | 'pedido' | 'volume' | 'validade' | 'ambiente'`.

Padrões literais (`src/domain/alerts.ts:108-119`):

```ts
export const DEFAULT_ALERTS: AlertSettings = {
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};
```

Três decisões escritas junto:

- **`ambiente` nasce ligado e `volume` nasce desligado**, e a diferença é o custo
  do erro: *"câmara fora de faixa estraga o estoque inteiro em uma noite"*
  (`src/domain/alerts.ts:109-113`).
- **`notifyFull: false`** é a única decisão do módulo que contraria a leitura
  literal do pedido do dono — ele desenhou quatro faixas, e faixa é cor; nada
  dizia que todas as quatro devem acordar alguém (`src/domain/alerts.ts:64-77`).
- **`minuteOfDay` substituiu uma lista de seis horas** (5, 6, 7, 8, 12, 18) que
  o dono cortou: *"nem toda fábrica funciona igual"*; oferecer seis opções *"não
  é configurar, é um menu disfarçado de escolha"* (`src/domain/alerts.ts:82-96`;
  o registro do episódio está em `docs/insights.md:1981-1999`).

#### Persistência

Chave: `const ALERTS_KEY = 'alerts.settings'` (`src/data/repository.ts:3924`),
gravada como **JSON numa linha de `app_meta`** — não em tabela própria, porque *"é
curto, é reescrito inteiro e não tem histórico próprio. O histórico dos avisos é o
livro-razão que os gerou"* (`src/data/repository.ts:3926-3937`).

Leitura **deliberadamente tolerante** (`src/data/repository.ts:3939-3962`): sem
linha devolve `DEFAULT_ALERTS`; JSON quebrado cai no `catch` e devolve
`DEFAULT_ALERTS`; cada sub-objeto é espalhado sobre o padrão
(`{ ...DEFAULT_ALERTS.on, ...(lido.on ?? {}) }`), e os dois números são validados
por faixa:

- `minuteOfDay` aceito só se `typeof === 'number' && >= 0 && <= 1439`, e então
  `Math.trunc` (`src/data/repository.ts:3948-3953`);
- `weekdays` aceito só se `typeof === 'number' && >= 0 && <= 127`, e então
  `Math.trunc` (`src/data/repository.ts:3954-3957`).

Escrita: `setAlertSettings(settings)` → `writeMeta(ALERTS_KEY, JSON.stringify(settings))`
(`src/data/repository.ts:3964-3966`).

#### A tela de Ajustes

Cartão em `app/settings.tsx:832-1020`, com crachá `GlyphThermometer` e tom
`palette.mist` (`:835-836`). O que ela oferece:

- Lista fixa na ordem `['ambiente','insumo','pedido','validade','volume']`
  (`app/settings.tsx:844`) — a ordem da urgência, não a alfabética.
- Cada linha: `Chip` de Ligado/Desligado que grava `on[kind]` invertido
  (`:869-882`), com `accessibilityRole="switch"` (`:872`).
- `volume` e `ambiente` não têm antecedência — `const dias = kind === 'volume' || kind === 'ambiente' ? null : alerts.daysAhead[kind]`
  (`:850-851`), com o motivo escrito: *"antecedência é para o que se vê chegando;
  faixa é para o que já aconteceu"* (`:846-848`).
- A antecedência é um conjunto de chips `[1, 2, 3, 5, 7, 14]`
  (`app/settings.tsx:918`), e só aparece para alarme **ligado** que tem dia
  (`app/settings.tsx:916`).
- `notifyFull` aparece como chip extra **só** quando `volume` está ligado
  (`:888-910`).
- Hora e minuto são dois `Field` numéricos que se juntam em `minuteOfDay`:
  hora aceita 0–23 e grava `Math.trunc(h) * 60 + (alerts.minuteOfDay % 60)`
  (`:956-967`); minuto aceita 0–59 e grava
  `Math.floor(alerts.minuteOfDay / 60) * 60 + Math.trunc(m)` (`:971-982`).
- Dias da semana: sete chips, `escolhido = alerts.weekdays !== 0 && agreedOn(alerts.weekdays, dia)`
  (`:995`), gravando `toggleDay(alerts.weekdays, dia)` (`:1000`); com
  `weekdays === 0` a tela escreve "todos os dias" (`:1014-1017`).

`WEEK_BITS = [1, 2, 4, 8, 16, 32, 64]`, domingo no bit 0, mesma numeração de
`Date.getDay()` (`src/domain/agreement.ts:17`); `agreedOn` e `toggleDay` lançam
`RangeError` para dia fora de 0–6 (`src/domain/agreement.ts:29-33,37-44`).

### 23.6 Os fatos: `factsForAlerts`

Assinatura: `export async function factsForAlerts(timeZone: string): Promise<AlertFacts>`
(`src/notify/facts.ts:28`).

As seis datas calculadas primeiro (`src/notify/facts.ts:29-34`):

| Nome | Cálculo | Serve para |
|---|---|---|
| `today` | `dayWindow(nowIso(), timeZone)` | fim da janela de consumo |
| `lastWeek` | `dayWindow(nowIso(), timeZone, -7)` | início da janela de consumo |
| `through` | `localDate(nowIso(), timeZone, 7)` | horizonte da demanda |
| `trinta` | `localDate(nowIso(), timeZone, 30)` | horizonte de validade |
| `agora` | `new Date(nowIso())` | idade da leitura ambiental |
| `hoje` | `localDate(nowIso(), timeZone)` | base das subtrações de dias |

`localDate(atIso, timeZone, days)` devolve `YYYY-MM-DD` no fuso pedido
(`src/domain/day.ts:37-47`); `dayWindow` devolve `{from, to}` como instantes UTC
das meias-noites locais, medindo o deslocamento em cada ponta para sobreviver a
horário de verão (`src/domain/day.ts:49-68`).

As sete consultas, num único `Promise.all` (`src/notify/facts.ts:36-51`):

| Consulta | Chamada literal | Origem |
|---|---|---|
| `cover` | `runningOut(LOCAL_COMPANY_ID, lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY)` | `src/data/repository.ts:3790` |
| `demand` | `stockAgainstOrders(LOCAL_COMPANY_ID, through)` | `:4147` |
| `orders` | `listOrders(LOCAL_COMPANY_ID, ['pending', 'open'])` | `:4034` |
| `expiring` | `expiringSoon(LOCAL_COMPANY_ID, trinta, 10)` | `:2967` |
| `items` | `listItems(LOCAL_COMPANY_ID)` | `:146` |
| `places` | `listPlaces(LOCAL_COMPANY_ID)` | `:594` |
| `readings` | `lastReadings(LOCAL_COMPANY_ID)` | `:2828` |

`LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'` (`src/data/seed.ts:12`).

Três escolhas de recorte, com o motivo no código:

- **`horizon = Number.POSITIVE_INFINITY` no `runningOut`** — o corte de dias é do
  alarme (`daysAhead.insumo`), não da consulta. `runningOut` calcula
  `dailyOutflow = out_units / days` e `daysLeft = daysOfCover(on_hand, dailyOutflow)`,
  descartando o que não tem saída (`daysOfCover` devolve `null` quando
  `dailyOutflow <= 0`) e o que passa do horizonte
  (`src/data/repository.ts:3841-3846`; `src/domain/ledger.ts:172-175`). Os tipos
  de item padrão são `['input','packaging']` (`src/data/repository.ts:3805`).
- **Os pedidos em aberto vêm ALÉM da demanda somada**, e não é redundância: *"a
  demanda agrupa por ITEM e o aviso conta LOJAS. Sem esta consulta eu estava
  usando o id do item como id de loja — o aviso diria 'quatro lojas esperando'
  para quatro sabores pedidos pela mesma loja"* (`src/notify/facts.ts:39-42`).
- **`expiringSoon` é chamado SEM local** — *"o alarme é sobre o lote, não sobre a
  prateleira. Filtrar pelo almoxarifado emudecia o aviso no dia em que o picolé
  ia para a câmara fria — que é o dia seguinte ao de produzi-lo"*
  (`src/notify/facts.ts:44-46`).

#### Como cada campo do `AlertFacts` é montado

**`cover`** (`src/notify/facts.ts:54`): `cover.map(c => ({ itemId, name, daysLeft }))`
— repasse direto de três dos seis campos de `Running`
(`src/data/repository.ts:3766-3773`).

**`orders`** (`src/notify/facts.ts:58-78`): uma linha por par **(item, loja)** em
falta:

```ts
orders: demand.flatMap((d) => {
  const missing = Math.max(0, d.requested - d.onHand);
  if (missing <= 0) return [];
  const esperando = orders.filter((o) => o.lines.some((l) => l.itemId === d.itemId));
  return esperando.map((o) => ({
    itemId: d.itemId,
    name: d.name,
    missing,
    daysUntil: o.requestedFor
      ? Math.round(
          (new Date(`${o.requestedFor}T00:00:00.000Z`).getTime() -
            new Date(`${hoje}T00:00:00.000Z`).getTime()) / 86_400_000,
        )
      : 0,
    placeId: o.placeId,
  }));
}),
```

Duas regras dentro disso: a falta é a **da fábrica, do item**, e a loja é quem
está esperando por ela (`:55-57`); e **pedido sem data é pedido para hoje**
(`daysUntil = 0`), porque *"empurrá-lo para o fim da fila é o app decidindo calado
o que o cliente não disse"* (`:66-68`).

**`volumes`** (`src/notify/facts.ts:94-100`):
`items.map(i => ({ itemId: i.id, name: i.name, onHand: i.onHandBaseUnits, fullLevel: i.fullLevel }))`.
**Qualquer item, sem filtro de tipo** — a primeira versão filtrava insumo e
embalagem, copiando o recorte do cartão de "dinheiro parado", que é outra
pergunta; *"a faixa azul do dono ('80 a 100%') é justamente sobre a CÂMARA CHEIA
de produto acabado: quem enche a câmara para de produzir por falta de espaço, e
isso não aparece olhando insumo"* (`:86-90`). Item sem régua sai por si mesmo:
`fullLevel` nulo não gera faixa (`:92-93`).

**`expiring`** (`src/notify/facts.ts:101-109`): `lotId`, `code`, e
`daysLeft = Math.round((Date(expiresOn 00:00Z) - Date(hoje 00:00Z)) / 86_400_000)`.

**`ambient`** (`src/notify/facts.ts:110-123`): para cada leitura mais recente por
`(location_id, kind)` (`lastReadings`, `src/data/repository.ts:2839-2851`):

```ts
const lugar = places.find((p) => p.id === r.locationId);
const faixa = lugar?.sensorRanges[r.kind];
return {
  locationId: r.locationId,
  place: lugar?.name || '',
  kind: r.kind,
  value: r.value,
  unit: r.unit,
  min: faixa?.min ?? null,
  max: faixa?.max ?? null,
  hoursOld: Math.max(0, (agora.getTime() - new Date(r.takenAt).getTime()) / 3_600_000),
};
```

`sensorRanges` é `Record<string, SensorRange>` no lugar
(`src/data/repository.ts:584`), e leitura sem faixa cadastrada chega com
`min: null, max: null` — fato sem julgamento. `hoursOld` existe para separar
*"está quente"* de *"parou de medir"* (`src/domain/alerts.ts:225`), mas
**`alertsDue` não usa `hoursOld` em nenhuma decisão** (`src/domain/alerts.ts:291-305`):
é dado calculado sem leitor.

### 23.7 Quando avisa: `alertsDue(facts, settings)`

`src/domain/alerts.ts:236-317`. Um bloco por tipo, cada um guardado por
`settings.on[kind]`:

| Tipo | Condição exata | `amount` | Extras | Linhas |
|---|---|---|---|---|
| `insumo` | `item.daysLeft <= settings.daysAhead.insumo` | `item.daysLeft` | — | `:239-244` |
| `pedido` | `o.missing > 0 && o.daysUntil <= settings.daysAhead.pedido` | `order.missing` | `places` = **contagem de lojas distintas** entre os pedidos em falta | `:246-262` |
| `volume` | `volumeBand(...)` não nula e pertencente a `FAIXAS_QUE_AVISAM`; azul só se `bands.notifyFull` | `Math.round((onHand / fullLevel) * 100)` | `band` | `:264-282` |
| `validade` | `lote.daysLeft <= settings.daysAhead.validade` | `lote.daysLeft` | — | `:284-289` |
| `ambiente` | `value < min` (com `min !== null`) **ou** `value > max` (com `max !== null`) | `leitura.value` | `unit`, `quantity` | `:291-305` |

Detalhes que decidem números:

- **As lojas contam UMA VEZ**: `const lojas = new Set(emFalta.map(o => o.placeId)).size`
  (`src/domain/alerts.ts:252`), e o mesmo total vai em **todas** as linhas de
  pedido geradas (`:259`). O comentário: *"o aviso é sobre quantos telefonemas o
  dia vai ter, não sobre quantas linhas de pedido"* (`:250-251`).
- **Ordenação final** (`src/domain/alerts.ts:309-316`): primeiro por urgência de
  tipo — `ambiente: 0, insumo: 1, pedido: 2, validade: 3, volume: 4` — e, dentro
  do mesmo tipo, por `a.amount - b.amount` (o mais apertado primeiro). O motivo é
  o custo do erro: *"insumo que acaba custa uma compra atrasada; câmara fora de
  faixa custa o estoque inteiro numa noite"* (`:307-308`).
- Como o adaptador manda **só `avisos[0]`** (`src/notify/index.ts:101`), essa
  ordenação é literalmente o que decide qual notificação chega.

O tipo `Alert` (`src/domain/alerts.ts:159-180`): `kind`, `subjectId`, `subject`,
`amount`, e os opcionais `band?`, `places?`, `unit?`, `quantity?`.

### 23.8 As faixas de volume: `volumeBand`

`src/domain/alerts.ts:133-146`, na ordem exata de avaliação:

```ts
if (fullLevel === null || !(fullLevel > 0)) return null;
if (onHand <= 0) return 'zerado';
const share = (onHand / fullLevel) * 100;
if (share <= bands.red) return 'vermelho';
if (share <= bands.yellow) return 'amarelo';
if (share >= bands.blue) return 'azul';
return 'verde';
```

`VolumeBand = 'zerado' | 'vermelho' | 'amarelo' | 'verde' | 'azul'`
(`src/domain/alerts.ts:131`). Com os padrões (25/40/80): ≤25% vermelho, ≤40%
amarelo, ≥80% azul, o meio é verde. Entre `yellow` e `blue` **não existe faixa de
propósito**: é o estado normal, e estado normal é calado (`:56-58`).

`FAIXAS_QUE_AVISAM = new Set<VolumeBand>(['zerado','vermelho','amarelo','azul'])`
(`src/domain/alerts.ts:156`) — o **verde nunca notifica**, e o azul só quando
`notifyFull` (`:271`).

### 23.9 Quando o aviso chega: `alertsRunToday` e `nextAlertAt`

`alertsRunToday(settings, weekday)` (`src/domain/alerts.ts:324-328`):

```ts
if (settings.weekdays === 0) return true;      // zero é TODOS os dias
if (weekday < 0 || weekday > 6) return false;
return (settings.weekdays & (1 << weekday)) !== 0;
```

`nextAlertAt(settings, now, horizon = 8)` (`src/domain/alerts.ts:337-352`):
percorre `ahead` de 0 a `horizon - 1`, monta o dia com
`dia.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0)`, e **pula**
(a) todo instante `<= now` e (b) todo dia que não está no acordo. Devolve o
primeiro que sobra, ou `null`. O `<=` é literal e testado: *"agendar para o
instante presente é uma corrida que o sistema operacional ganha"*
(`src/domain/alerts.test.ts:175-179`).

### 23.10 A frase: `alertPhrase`

`src/notify/phrase.ts:20-51`:

```ts
export function alertPhrase(alert: Alert, t: Dictionary): { title: string; body: string } {
  const words = t.alertText[alert.kind];
  const amount =
    alert.kind === 'insumo' || alert.kind === 'validade'
      ? plural(Math.max(0, Math.floor(alert.amount)), t.app.home.dayCount)
      : alert.kind === 'ambiente'
        ? String(Math.round(alert.amount * 10) / 10)
        : String(Math.round(alert.amount));

  const valores = {
    subject: alert.subject,
    amount,
    unit: alert.unit ?? '',
    places: alert.places === undefined ? '' : plural(alert.places, t.app.home.placeCount),
  };

  return { title: fill(words.title, valores), body: fill(words.body, valores) };
}
```

**A unidade de cada aviso**, que foi correção do dono (`src/notify/phrase.ts:28-31`):

| Tipo | Como o número sai | Exemplo pt-BR |
|---|---|---|
| `insumo`, `validade` | dias, por `plural(..., t.app.home.dayCount)`, com piso em zero e `Math.floor` | "2 dias", "1 dia" |
| `ambiente` | **uma decimal preservada**: `Math.round(amount * 10) / 10` | "-8,4" / "-8.4" |
| `pedido`, `volume` | inteiro: `Math.round(amount)` | "300", "12" |
| `places` (só `pedido`) | `plural(places, t.app.home.placeCount)` | "2 lojas" |
| `unit` | repassada crua; string vazia quando ausente | "C" |

A fração no `ambiente` é escrita como decisão: *"meio grau de freezer é diferença
real, e arredondar aqui repetiria o defeito que a tela de leitura já teve"*
(`src/notify/phrase.ts:37-39`; o defeito original está em `docs/insights.md:2003-2018`).

`fill(template, values)` troca `{{chave}}` por valor e **deixa o buraco intacto**
quando a chave não existe (`src/i18n/index.ts:40-44`) — é por isso que o teste de
buraco existe. `plural(n, {one, other}, display?)` escolhe a forma por `n === 1`
e prefixa o número quando nenhuma das formas tem `{{n}}`
(`src/i18n/index.ts:55-89`).

Plurais usados: `t.app.home.dayCount` = `{ one: '1 dia', other: '{{n}} dias' }`
(`src/i18n/locales/pt-BR.ts:140`), `{ one: '1 day', other: '{{n}} days' }`
(`en.ts:117`), `{ one: '1 día', other: '{{n}} días' }` (`es.ts:122`);
`t.app.home.placeCount` = `{ one: 'uma loja', other: '{{n}} lojas' }`
(`pt-BR.ts:139`), `{ one: 'one store', other: '{{n}} stores' }` (`en.ts:116`),
`{ one: 'una tienda', other: '{{n}} tiendas' }` (`es.ts:121`).

#### Os textos das notificações, literais nos três idiomas

`t.alertText` — pt-BR `src/i18n/locales/pt-BR.ts:1088-1100`, en `en.ts:987-998`,
es `es.ts:993-1004`. O docblock do pt-BR explica a forma: *"Título é o que decide;
corpo é o número que sustenta. Nada de 'confira o estoque' — o dono já sabe
conferir, o que ele não sabe é o quê"* (`pt-BR.ts:1080-1087`).

| Tipo | pt-BR | en | es |
|---|---|---|---|
| `insumo` | **Compre {{subject}}** / *Acaba em {{amount}} pelo consumo desta semana.* | **Buy {{subject}}** / *Runs out in {{amount}} at this week usage.* | **Compra {{subject}}** / *Se acaba en {{amount}} según el consumo de la semana.* |
| `pedido` | **{{places}} esperando carga** / *Faltam {{amount}} de {{subject}} para atender.* | **{{places}} waiting for a load** / *{{amount}} of {{subject}} short.* | **{{places}} esperando carga** / *Faltan {{amount}} de {{subject}} para atender.* |
| `volume` | **{{subject}} em {{amount}}%** / *Do cheio que você cadastrou.* | **{{subject}} at {{amount}}%** / *Of the full level you set.* | **{{subject}} en {{amount}}%** / *De lo lleno que cargaste.* |
| `validade` | **Lote {{subject}} vence** / *Em {{amount}} — mande esse primeiro.* | **Lot {{subject}} expires** / *In {{amount}} — send that one first.* | **Lote {{subject}} vence** / *En {{amount}} — manda ese primero.* |
| `ambiente` | **{{subject}} fora da faixa** / *{{amount}} °{{unit}} agora. Confira a porta e o motor.* | **{{subject}} out of range** / *{{amount}} °{{unit}} right now. Check the door and the motor.* | **{{subject}} fuera del rango** / *{{amount}} °{{unit}} ahora. Revisa la puerta y el motor.* |

Note que o `°` é literal no dicionário e a `{{unit}}` é a letra ("C") — o texto
final sai `-8,4 °C`.

Os nomes de cada alarme na tela de Ajustes (`t.app.settings.alerts.kinds`,
`pt-BR.ts:478-484`): `insumo: 'Insumo acabando'`, `pedido: 'Pedido sem estoque'`,
`volume: 'Volume fora da faixa'`, `ambiente: 'Câmara fora da faixa'`,
`validade: 'Lote perto de vencer'`. Em inglês (`en.ts:422-428`): "Input running
out", "Order with no stock", "Volume out of range", "Room out of range", "Lot
close to expiry". Em espanhol (`es.ts:427-433`): "Insumo por acabarse", "Pedido
sin inventario", "Volumen fuera del rango", "Cámara fuera del rango", "Lote por
vencer".

### 23.11 Permissões do sistema operacional e o que acontece na web

- **Fluxo de permissão:** `getPermissionsAsync()` primeiro; se não estiver
  concedida, `requestPermissionsAsync()` — ou seja, **a permissão é pedida na
  primeira abertura**, dentro do efeito do `Alerts` (`src/notify/index.ts:80-83`).
  Não existe tela de preparação nem explicação antes do diálogo do SO:
  **NÃO ESTÁ NO CÓDIGO**.
- **Recusa é silenciosa:** devolve `'sem-permissao'` e ninguém lê. A frase
  existe (`t.app.settings.alerts.never`) e **não é usada em lugar algum**.
- **Web:** `Platform.OS === 'web'` ⇒ `biblioteca()` devolve `null` e o resultado é
  `'sem-suporte'` (`src/notify/index.ts:55,77`). Nenhum módulo de notificação é
  carregado no navegador, nada é agendado, nada aparece. O aplicativo continua
  inteiro — *"a capa faz as mesmas contas, com os mesmos números, sem nenhum
  aviso"* (`src/notify/index.ts:18-22`).
- **Configuração do projeto:** `expo-notifications` está em `plugins`
  (`app.json:35`) e em `dependencies` como `"expo-notifications": "~57.0.16"`
  (`package.json:29`). **Nenhuma permissão Android é declarada explicitamente** no
  `app.json` (não há `android.permissions`): **NÃO ESTÁ NO CÓDIGO**. O roadmap
  registra "Permissões do Android — pedir só o que se usa" como pendência de
  publicação (`docs/roadmap.md:322-323`).
- **Push remoto (servidor mandando aviso): NÃO IMPLEMENTADO.** Tudo é
  `scheduleNotificationAsync` local, calculado no aparelho a partir do
  livro-razão local.

### 23.12 O que os testes e as mutações garantem nos avisos

`src/notify/facts.test.ts` — **contra banco de verdade**, `node:sqlite` em memória
com o mesmo `migrate` do aplicativo (`:22-55`). Três casos:

1. *"the order alert counts stores, not flavours"* (`:57-98`): dois pedidos da
   mesma loja ⇒ um `placeId` distinto; loja diferente pedindo o mesmo produto ⇒
   dois. O motivo de ser contra banco real está escrito: *"um dublê teria
   concordado com o defeito, porque eu mesmo o teria montado com o id errado"*
   (`:16-18`).
2. *"a reading with no range is a fact without a judgement"* (`:100-133`): leitura
   sem faixa chega com `min`/`max` nulos e com o nome do lugar; depois de
   cadastrar `sensorRanges: { temperature: { min: -22, max: -16, unit: 'C' } }`,
   os mesmos fatos passam a ter faixa.
3. *"the full cold room alarms too"* (`:135-206`): produto acabado com
   `fullLevel: 100` entra em `volumes`; com 300 produzidos e `notifyFull: false`
   `alertsDue` devolve `[]`; com `notifyFull: true` sai um aviso com `band: 'azul'`.

`src/notify/phrase.test.ts` — três casos, sem banco:

1. *"no notification ever ships a hole to the lock screen"* (`:34-48`): varre os
   **três idiomas × cinco tipos** e reprova qualquer `{{` ou texto vazio em título
   ou corpo.
2. *"each alert carries the number in the unit that alert measures"* (`:50-71`):
   cobra `/2 dias/`, `/3 dias/`, `/2 lojas/`, `/Palito em 12%/`,
   `/Câmara 1 fora da faixa/` e `/-8,4 °C|-8\.4 °C/`.
3. *"one alert kind cannot be added without its words in three languages"*
   (`:73-95`): fecha a fresta que o `Widen<T>` não fecha — um `AlertKind` novo sem
   frase reprova aqui; e confere de passagem que todo `BRIEFING_WIDGETS` tem nome
   nos três idiomas.

Os exemplos usados (`src/notify/phrase.test.ts:13-32`) são o retrato do formato de
cada `Alert`: `insumo` com `amount: 2`; `pedido` com `amount: 300, places: 2`;
`volume` com `amount: 12, band: 'vermelho'`; `validade` com `subject: '20260903-01'`;
`ambiente` com `amount: -8.4, unit: 'C', quantity: 'temperature'`.

**Mutações vivas no `scripts/mutate.mjs`** que protegem este assunto:

| Arquivo mutado | Troca | O que dói |
|---|---|---|
| `src/domain/alerts.ts` | `if (faixa === 'azul' && !settings.bands.notifyFull)` → sem o `!` | inverte o aviso de cheio: quem pediu deixa de receber (`scripts/mutate.mjs:351-357`) |
| `src/notify/phrase.ts` | a fração do `ambiente` → `String(Math.round(alert.amount))` | -18,4 chega como -18, e meia diferença de freezer some (`:359-365`) |
| `src/notify/facts.ts` | `placeId: o.placeId` → `placeId: d.itemId` | sabor passa a contar como loja (`:367-373`) |
| `src/domain/alerts.ts` | `if (settings.weekdays === 0) return true` → `false` | a configuração vazia silencia todos os avisos (`:375-381`) |
| `src/domain/alerts.ts` | `share <= bands.red` → `share < bands.red` | o item exatamente no piso vermelho é desenhado melhor do que está (`:383-389`) |
| `src/domain/alerts.ts` | `dia.getTime() <= now` → `<` | o aviso pode ser agendado para o instante presente e não disparar (`:391-397`) |

---

## PARTE B — CLIMA

### 23.13 Provedor, endpoints e o que é buscado

Provedor: **Open-Meteo**, dois endpoints, ambos constantes no módulo
(`src/weather/index.ts:75-76`):

```ts
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
```

**Busca de cidade** (`searchPlaces`, `src/weather/index.ts:172-184`):

```
https://geocoding-api.open-meteo.com/v1/search?name=<termo encodeURIComponent>&count=6&format=json
```

Termo com menos de 2 caracteres (`term.trim().length < 2`) devolve `[]` sem tocar
a rede (`:176`). Qualquer exceção cai em `catch` e devolve `[]` (`:181-183`).

**Previsão** (`fetchForecast`, `src/weather/index.ts:187-203`), URL montada
literalmente:

```
https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>
  &daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max
  &timezone=auto&forecast_days=2
```

Três coisas ficam ditas por essa URL: só as **três** variáveis diárias são
pedidas; `timezone=auto` faz o dia vir na data local **do lugar**, não do aparelho
(`src/weather/index.ts:44`); e `forecast_days=2` — **só hoje e amanhã**. Dias
vazios (`days.length === 0`) devolvem `null` em vez de um `Forecast` sem conteúdo
(`:198`), e exceção também devolve `null` (`:200-202`).

**Divergência documentada:** o cartão da capa desenha `weather.days.slice(0, 7)`
(`src/home/Mosaic.tsx:324`) — sete dias —, mas a busca pede dois
(`forecast_days=2`). Na prática a "semana" que abre no toque mostra no máximo dois
dias com o provedor atual. Aumentar `forecast_days` **NÃO ESTÁ NO CÓDIGO**.

**Licença:** o Open-Meteo é gratuito para uso **não comercial**; publicar exige
trocar de provedor ou entrar em plano pago, e isso está registrado como decisão de
gasto do dono (`docs/roadmap.md:313-315`).

### 23.14 Os tipos do clima

```ts
export type WeatherPlace = {              // src/weather/index.ts:34-40
  name: string;
  region: string | null;                  // "Estado ou província, quando a fonte diz. Duas 'Santa Maria' existem."
  latitude: number;
  longitude: number;
};

export type ForecastDay = {               // :43-50
  date: string;                           // YYYY-MM-DD, no fuso do LUGAR
  maxC: number;
  minC: number;
  rainChance: number | null;              // % quando a fonte diz
};

export type Forecast = {                  // :52-57
  place: WeatherPlace;
  fetchedAt: string;                      // quando o APARELHO perguntou
  days: ForecastDay[];
};

export type Reading = {                   // :68-73
  today: ForecastDay;
  tomorrow: ForecastDay | null;
  warmerBy: number | null;                // positivo esquenta, negativo esfria, null sem amanhã
};

export type WeatherDeps = {               // :210-218
  fetchJson: (url: string) => Promise<unknown>;
  now: () => string;
  timeZone: string;
  readPlace: () => Promise<WeatherPlace | null>;
  writePlace: (place: WeatherPlace) => Promise<void>;
  readCache: () => Promise<Forecast | null>;
  writeCache: (forecast: Forecast) => Promise<void>;
};
```

`fetchedAt` tem razão escrita: *"Um número de clima sem hora é um número que pode
ser de anteontem, e quem olha não tem como saber"* (`src/weather/index.ts:28-30`).

### 23.15 A cidade se deduz do fuso, não se pergunta

`cityFromTimeZone(timeZone)` (`src/weather/index.ts:89-96`):

```ts
if (!timeZone.includes('/')) return null;       // 'UTC', 'GMT'
const parts = timeZone.split('/');
if (parts[0] === 'Etc') return null;            // 'Etc/GMT-3'
const last = parts[parts.length - 1];
if (!last || /[0-9+]/.test(last)) return null;  // qualquer coisa com dígito ou '+'
return last.replace(/_/g, ' ');                 // 'Sao_Paulo' → 'Sao Paulo'
```

Resultados provados (`src/weather/weather.test.ts:44-54`): `America/Sao_Paulo` →
`'Sao Paulo'`; `America/Argentina/Buenos_Aires` → `'Buenos Aires'`;
`Europe/Madrid` → `'Madrid'`; `UTC` → `null`; `Etc/GMT-3` → `null`.

*"Nulo aqui significa 'pergunte', e é a única situação em que se pergunta"*
(`src/weather/index.ts:87-88`). O nome deduzido **aparece no cartão**, então o
palpite errado é visível e trocável num toque (`src/weather/index.ts:23-27`).

### 23.16 Leitura defensiva das respostas

`parsePlaces(json)` (`src/weather/index.ts:99-115`): exige `results` array;
descarta linha sem `name` string, e sem `latitude`/`longitude` numéricos;
`region` vem de `admin1` quando for string, senão `null`.

`parseDays(json)` (`src/weather/index.ts:124-142`): lê `daily.time`,
`daily.temperature_2m_max`, `daily.temperature_2m_min` e
`daily.precipitation_probability_max`; devolve `[]` se qualquer um dos três
primeiros não for array. Por índice: descarta `date` não-string e descarta o dia
inteiro se `max[i]` ou `min[i]` não for número. `rainChance` vira `null` quando o
array de chuva não existe ou o item não é número.

A regra é escrita: *"Um dia sem máxima ou sem mínima é descartado inteiro em vez
de entrar com zero: 0° num dia de setembro em São Paulo não é um dado faltando, é
um dado errado, e o cartão o desenharia com a mesma confiança dos outros"*
(`src/weather/index.ts:120-122`). Provas: `parseDays({})` e `parseDays(null)`
devolvem `[]`; um `temperature_2m_max: [30.6, null]` deixa só o primeiro dia
(`src/weather/weather.test.ts:56-77`).

### 23.17 Cache e validade

Prazo: `export const FRESH_FOR_MINUTES = 180` — três horas
(`src/weather/index.ts:78-79`). Exportada, mas **só consumida como valor padrão
dentro do próprio arquivo** (`:145`): não tem chamador externo.

```ts
export function isStale(forecast, nowIso, freshForMinutes = FRESH_FOR_MINUTES): boolean {
  const age = Date.parse(nowIso) - Date.parse(forecast.fetchedAt);
  return !(age >= 0) || age > freshForMinutes * 60_000;
}
```
(`src/weather/index.ts:145-148`)

O `!(age >= 0)` cobre **relógio andando para trás** — fuso, viagem, ajuste manual:
idade negativa não é "fresquíssima", é motivo para perguntar de novo
(`src/weather/weather.test.ts:120-122`). Duas horas de idade não é velho; quatro é
(`:117-118`).

Mesmo lugar? `samePlace(a, b)` compara coordenada com tolerância de 0,01 grau em
cada eixo (`src/weather/index.ts:206-208`) — cache de outra cidade **não é cache**
(`src/weather/weather.test.ts:196-209`).

### 23.18 O que ainda vale de uma previsão guardada: `reading`

```ts
export function reading(forecast: Forecast, today: string): Reading | null {
  const from = forecast.days.findIndex((d) => d.date >= today);
  if (from < 0) return null;
  const hoje = forecast.days[from];
  const amanha = forecast.days[from + 1] ?? null;
  return {
    today: hoje,
    tomorrow: amanha,
    warmerBy: amanha ? Math.round(amanha.maxC) - Math.round(hoje.maxC) : null,
  };
}
```
(`src/weather/index.ts:159-169`)

Duas regras de produto embutidas:

- **O dia de hoje é PROCURADO na lista**, e previsão inteiramente vencida devolve
  `null`: *"é melhor não ter cartão que ter um cartão errado"*
  (`src/weather/index.ts:150-158`). Teste: `reading(forecast, '2026-09-05')` com
  dias 02 e 03 devolve `null` (`src/weather/weather.test.ts:106`).
- **`warmerBy` é calculado sobre os graus JÁ ARREDONDADOS**, para que o número
  dito seja a subtração dos números mostrados. Com 30,6 e 32,4 (que aparecem como
  31 e 32) o resultado é **1**, não 2 — a diferença crua 1,8 arredondaria para 2 e
  a tela mentiria por um grau (`src/weather/index.ts:59-66`;
  `src/weather/weather.test.ts:91-100`).

### 23.19 A orquestração: `currentForecast`

`src/weather/index.ts:228-251`, na ordem exata:

```ts
const cached = await deps.readCache();
let place = await deps.readPlace();

if (!place) {
  const guess = cityFromTimeZone(deps.timeZone);
  if (!guess) return cached;                       // fuso sem cidade: devolve o cache e sai
  const found = await searchPlaces(guess, deps.fetchJson);
  if (found.length === 0) return cached;           // geocoder mudo: devolve o cache e sai
  place = found[0];                                // o PRIMEIRO resultado
  await deps.writePlace(place);                    // deduzida uma vez, guardada
}

const usable = cached && samePlace(cached.place, place) ? cached : null;
if (usable && !isStale(usable, deps.now())) return usable;   // fresco: nada de rede

const fresh = await fetchForecast(place, deps.fetchJson, deps.now());
if (!fresh) return usable;                         // rede falhou: o que já estava aqui vale
await deps.writeCache(fresh);
return fresh;
```

*"cache primeiro, rede depois, nunca exceção"* (`src/weather/index.ts:220-227`).
Comportamentos provados (`src/weather/weather.test.ts:156-209`):

| Situação | Resultado | Chamadas de rede |
|---|---|---|
| cache fresco (1 h) do mesmo lugar | devolve o cache | **zero** |
| cache vencido (6 h) e sem rede | devolve o cache antigo | 1 (tentou) |
| sem cache e sem rede | **`null` — o cartão não existe** | 1 |
| sem cidade, com rede | geocoder e previsão, nessa ordem | 2 |
| segunda abertura, previsão fresca | nada | zero |
| cidade trocada, cache da anterior | busca nova, cache antigo descartado | 1 |

### 23.20 O clima ligado no aparelho: `live.ts`

Chaves de `app_meta` (`src/weather/live.ts:12-13`):

| Chave | Conteúdo |
|---|---|
| `weather.place` | o `WeatherPlace` escolhido/deduzido |
| `weather.forecast` | o último `Forecast` inteiro, com `fetchedAt` |

Prazo de rede: `const TIMEOUT_MS = 8_000` — *"Oito segundos. Depois disso, o cache
responde melhor que a espera"* (`src/weather/live.ts:15-16`).

```ts
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
```
(`src/weather/live.ts:26-36`)

O `AbortController` é *"o que transforma 'sem rede' em 'nada mudou na tela'"* —
sem prazo, a promessa fica pendurada e a tela que espera por ela some com o cartão
que já tinha (`src/weather/live.ts:18-25`).

`readPlace()` / `writePlace(place)` são `readJson`/`writeJson` sobre `PLACE_KEY`
(`src/weather/live.ts:38-44`), e `forecastForScreen(timeZone)` monta as sete
dependências (`:49-59`) com `now: () => new Date().toISOString()`.

`readJson` **desconfia do que está no disco**: JSON quebrado devolve `null` em vez
de derrubar a tela — *"um cache é, por definição, algo de que se pode abrir mão"*
(`src/data/meta.ts:33-49`). E `app_meta` tem regra de conteúdo escrita: cabe
preferência e cache, **não cabe nada que alguém vá somar**, porque chave/valor é
exatamente o formato em que um `estoque_atual` renasceria (`src/data/meta.ts:10-13`).

### 23.21 Onde o clima é consultado

**Na capa** (`app/(tabs)/index.tsx:282-283`):

```ts
const { data: weather } = useQuery<Forecast | null>(() => forecastForScreen(locale.timeZone));
const sky = weather ? reading(weather, dayWindow(nowIso(), locale.timeZone).from.slice(0, 10)) : null;
```

**Consulta separada de propósito** — *"Pendurar a previsão no mesmo `Promise.all`
do briefing faria a capa inteira esperar pela rede: oito segundos de tela vazia
para mostrar o que o banco já tinha respondido"* (`app/(tabs)/index.tsx:102-111`;
o episódio está em `docs/insights.md:1551-1566`). `useQuery` refaz a pergunta
quando a tela volta ao foco (`src/data/useQuery.ts:66-70`), então cada retorno à
capa reexecuta `currentForecast` — que responde do cache sem rede enquanto estiver
fresco.

Os dois valores entram no `BriefingView` como `sky: Reading | null` e
`weather: Forecast | null` (`src/home/types.ts:54-55`;
`app/(tabs)/index.tsx:335-336`).

**Na tela de cidade** (`app/weather.tsx`): `readPlace()` via `useQuery` (`:64`),
`searchPlaces(term, fetchJson)` no botão (`:76`), `writePlace(place)` ao escolher
(`:83`). A busca exige 2 caracteres em dois lugares — no `disabled` do botão
(`:159`) e dentro de `search` (`:72`) —, e a Lei 5 é citada para explicar por quê:
antes o botão aceitava o toque e não fazia nada, *"que num celular de fábrica se
lê como 'o aplicativo travou'"* (`:152-155`). Sem resultado a tela diz **as duas
causas possíveis**: nome errado (`words.noResults`) e falta de rede
(`words.offline`) (`:165-170`). A tela é alcançável pelo menu `/more`, com
`t.app.weather.change` como detalhe da linha (`app/(tabs)/more.tsx:102`).

### 23.22 Faixas de temperatura: os limiares literais

`temperatureBand(maxC)` (`src/components/Sky.tsx:53-58`):

```ts
export function temperatureBand(maxC: number): 'cold' | 'mild' | 'warm' | 'hot' {
  if (maxC < 18) return 'cold';
  if (maxC < 26) return 'mild';
  if (maxC < 32) return 'warm';
  return 'hot';
}
```

| Faixa | Intervalo | Leitura |
|---|---|---|
| `cold` | `maxC < 18` | frio |
| `mild` | `18 ≤ maxC < 26` | ameno |
| `warm` | `26 ≤ maxC < 32` | quente |
| `hot` | `maxC ≥ 32` | muito quente |

A função é **exportada mas só usada dentro do próprio arquivo**
(`src/components/Sky.tsx:77`), e **não tem teste**.

### 23.23 Da temperatura para a cor: `skyInk`

```ts
export function skyInk(maxC: number, { palette, brand, skin }): string {
  const band = temperatureBand(maxC);
  if (band === 'cold') return palette.sky;
  if (band === 'mild') return skin === 'organico' ? brand : palette.mint;
  return band === 'warm' ? palette.sand : palette.apricot;
}
```
(`src/components/Sky.tsx:73-83`)

| Faixa | Cor | Observação |
|---|---|---|
| `cold` | `palette.sky` | o azul da área "casa/clima" |
| `mild` | `brand` no tema **Orgânico**, `palette.mint` no **Papel** | *"quem trocou o verde por âmbar não quer um dia morno verde"* (`:80-81`) |
| `warm` | `palette.sand` | |
| `hot` | `palette.apricot` | **a rampa para no terracota** |

Por que a rampa para: `rose` era o topo e *"saiu ROSA na foto, que nesta paleta é
a cor do Espelho da Loja e vizinha do vermelho de perigo. Trinta e três graus numa
fábrica de sorvete não é perigo, é o melhor dia do mês — pintá-lo de alerta ensina
a ler alerta como enfeite"* (`src/components/Sky.tsx:62-67`).

Valores concretos dos tokens dependem do tema e do esquema; por exemplo no
conjunto de `src/theme/tokens.ts:85-92`: `sky: '#3F7096'`, `mint: '#2F7D6B'`,
`sand: '#9A7429'`, `apricot: '#A75F3A'`; e no conjunto de `:116-123` (variante
clara/escura correspondente): `sky: '#8FB6D8'`, `mint: '#6FC4AE'`,
`sand: '#D9B76A'`, `apricot: '#E2A283'`. A cor **nunca** é hexadecimal escrito na
mão dentro de `Sky.tsx` — é sempre token (`src/components/Sky.tsx:88-91`).

`skyInk` é chamada em dois lugares: dentro do próprio `SkyMark`
(`src/components/Sky.tsx:105`) e no `Mosaic` para pintar régua e desenho com a
mesma tinta — `const corDoDia = sky ? skyInk(sky.today.maxC, { palette, brand, skin }) : palette.sky`
(`src/home/Mosaic.tsx:59`).

### 23.24 Da temperatura para o desenho: `SkyMark`

`SkyMark({ maxC, rainChance, size = 76 })` (`src/components/Sky.tsx:93-205`):

- `const raining = rainChance !== null && rainChance >= 30` (`:103`) — **30% é o
  corte de chuva** em todo o aplicativo.
- `const papel = skin === 'papel'` (`:104`); `const tinta = skyInk(...)` (`:105`);
  `const traco = papel ? 1.7 : 2.2` (`:130`).
- **Halo**: `RadialGradient` de raio 50% com três paradas — `stopOpacity` `0.30`
  em 0, `0.10` em 0.65 e `0` em 1 —, na **mesma cor** do traço, e **não existe no
  Papel** (`:137-148`). Razão: *"ele é a MESMA cor do traço, some antes da borda,
  e não existe no Papel, cuja identidade é traço sobre papel"* (`:88-91`).
- **Sol** (quando não chove): círculo `r=13` em `cx/cy = 34` mais **8 raios** em
  ângulos `i * π / 4`, de raio 20 a 27, `strokeLinecap="round"`, tudo na `tinta`
  (`:152-172`). Gira uma volta a cada **40 000 ms** (`:117`) — *"movimento que se
  percebe se você olhar, e não se percebe se você estiver trabalhando"* (`:115-116`).
- **Nuvem** (quando chove ≥ 30%): um `Path` de contorno mais três gotas em linha,
  e as gotas são pintadas com `palette.sky` **mesmo no dia quente** — *"quem olha
  quer saber se molha, e a temperatura já está dita no número ao lado"*
  (`:174-201`). Deriva `Math.sin(drift * 2π) * 4` px, ciclo de **9 000 ms**
  (`:118,126-128`).
- **Movimento respeita acessibilidade**: `AccessibilityInfo.isReduceMotionEnabled()`
  e, se reduzido, nenhuma animação começa (`:110-123`).

O sol **desaparece** no dia de chuva: *"desenhar sol num dia de chuva é a mesma
mentira do alerta inventado"* (`src/components/Sky.tsx:150-151`).

**Por que o desenho é pequeno.** O docblock de `Sky.tsx:14-50` guarda o episódio
inteiro: a primeira versão era uma **faixa de céu de 140 px com degradê entre duas
cores da paleta**, e as fotos mostraram (a) no Orgânico claro a 33° o degradê
verde→rosa passando por lama, (b) no Orgânico escuro um adesivo pastel com o sol
em `onAccent`, quase preto, e (c) no Papel um vazio de 92 px. *"O defeito comum
não é a cor escolhida: é a área. As cores desta paleta são tinta e traço — feitas
para desenhar sobre um fundo claro ou escuro, não para PREENCHER um terço da
tela."*

### 23.25 A régua do dia: `TemperatureRange`

`TemperatureRange({ minC, maxC, ink })` (`src/components/Sky.tsx:213-262`):

- **Escala FIXA de 0 a 40 °C**: `const clamp = (c) => Math.max(0, Math.min(1, c / 40))`
  (`:239`). Fixa de propósito — *"uma régua que se estica para caber no dado faria
  18° e 34° desenharem a mesma barra, e a comparação entre dois dias morreria"*
  (`:236-238`).
- A barra vai de `left: from * 100%` a `width: (to - from) * 100 * grown%`
  (`:243-246`), crescendo em **900 ms** na primeira aparição, ou instantânea com
  movimento reduzido (`:226-234`).
- Trilha: `height: 6`, `borderRadius: 3`, fundo `color.sunken` (`:250-256`).
- `ink` é opcional; sem ele a barra é `palette.apricot` (`:259`) — que é o caso da
  semana no cartão, onde cada dia usa a cor padrão em vez da cor do seu próprio
  grau (`src/home/Mosaic.tsx:330`).
- É a Lei 3 desenhada: *"21° sozinho não diz nada; 21° ocupando o pedaço quente de
  uma barra que vai de 13° a 21° diz o dia inteiro num relance"* (`:208-211`).

### 23.26 O cartão do clima na capa

`src/home/Mosaic.tsx:265-360`, peça de chave `clima`. Só existe quando há `sky`
(`:266`) — sem previsão **não há cartão**, e não há `--°`.

- Envelope `Touchable` que **abre a semana no lugar**, sem navegar
  (`:274-275`), com `accessibilityLabel` = `t.app.weather.overline` preenchido com
  a cidade (`:275`). O comentário registra que isso foi pedido do dono: *"a
  pergunta 'vou vender mais sexta?' se responde olhando sete dias de uma vez"*
  (`:269-273`).
- `Card hue={palette.sky}` (`:285`) — **o filete NÃO usa a cor do dia**, e há
  razão escrita: a cor da área é significado (produção laranja, clima azul), e
  variando com a temperatura *"a capa inteira ficava monocromática num dia quente:
  dois cartões cor de creme, um embaixo do outro"* (`:276-284`).
- Sobrelinha: `fill(t.app.weather.overline, { city: weather?.place.name ?? '' }).toUpperCase()`
  (`:286-288`).
- Número grande: `` `${Math.round(sky.today.maxC)}°` `` em `type.figure`
  (`:298`), com `t.app.weather.today` ao lado (`:300`) e a mínima abaixo,
  `fill(t.app.weather.low, { degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees) })`
  (`:302`).
- `<SkyMark maxC={sky.today.maxC} rainChance={sky.today.rainChance} />` (`:305`).
- `<TemperatureRange minC={sky.today.minC} maxC={sky.today.maxC} ink={corDoDia} />` (`:308`).
- **A comparação obrigatória** (`:309-318`): `warmerBy === 0` ⇒
  `t.app.weather.same`; `> 0` ⇒ `t.app.weather.warmer`; `< 0` ⇒
  `t.app.weather.cooler`, sempre com `plural(Math.abs(sky.warmerBy), t.app.weather.degrees)`.
  Esse é o item que satisfaz a Lei 3 para este número grande, e está registrado
  como tal no guarda da lei: `{ compara: /warmerBy|weather\.same/ }`
  (`src/law.test.ts:54`).
- **A semana**, só quando a peça está aberta: `weather.days.slice(0, 7)`, uma
  linha por dia com a inicial do dia da semana (largura 28), a régua, a máxima
  arredondada, e o percentual de chuva **só quando `rainChance >= 30`**
  (`:321-343`).
- Rodapé: `fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })`
  seguido de `·` e de "menos"/"mais" conforme a peça esteja aberta (`:345-348`),
  pintado em `palette.sky`.

### 23.27 A cena da capa que também é previsão: `Landscape`

Usada no tema **Orgânico** no lugar da `FactoryScene` do Papel, em dois pontos —
a peça de produção (`src/home/Mosaic.tsx:120-126`) e o cartão de primeiro dia
(`:895-901`) —, sempre com `maxC={sky ? sky.today.maxC : null}`,
`rainChance={sky ? sky.today.rainChance : null}` e `height={150}`.

Como a previsão move o desenho (`src/components/Landscape.tsx`):

| Entrada | Efeito | Linha |
|---|---|---|
| `maxC !== null && maxC >= 26` | `quente` ⇒ o degradê do céu vai a `stopOpacity 1`; abaixo de 26 fica `0.85` (*"mais lavado"*) | `:109-111,124` |
| `rainChance !== null && rainChance >= 30` | `chovendo` ⇒ nuvem e gotas aparecem; sem isso, nada de nuvem | `:77,160-181` |
| `running` (tacho aberto) | fumaça sobe da chaminé, ciclo de 7 000 ms | `:89-91,183-191` |
| `scheme === 'dark'` | `noite` ⇒ as matizes da paleta são escurecidas por `noturno(hex, fator)` em vez de trocadas por cinza | `:46-52,124-146` |
| sem previsão (`maxC` e `rainChance` nulos) | *"a paisagem existe sem tempo: colina, fábrica e sol, e nenhuma nuvem"* | `:30-32` |

O céu, as colinas e a marca saem de `hues[hue]` — `skyTop`, `skyBottom`,
`hillFar`, `hillNear` por matiz escolhida (`src/theme/tokens.ts:378-383`), p.ex.
`verde: { brand: '#2F7D5C', skyTop: '#DFF0E6', skyBottom: '#BFE3CF', hillFar: '#A9DCC0', hillNear: '#7CC9A6' }`.
O sol é o **único** elemento decorativo, e gira a cada 34 000 ms
(`src/components/Landscape.tsx:27-28,84,150-158`); ele é pintado com hexadecimais
literais (`'#FFD76A'` de dia, `'#F7E6B5'` de noite, `:152-153`), assim como as
gotas (`'#8EC5FC'`, `:172`).

### 23.28 Os textos do clima, literais nos três idiomas

`t.app.weather` — pt-BR `src/i18n/locales/pt-BR.ts:278-289`, en `en.ts:236-247`,
es `es.ts:241-252`:

| Chave | pt-BR | en | es |
|---|---|---|---|
| `overline` | `clima em {{city}}` | `weather in {{city}}` | `clima en {{city}}` |
| `today` | `máxima de hoje` | `today's high` | `máxima de hoy` |
| `low` | `mínima de {{degrees}}` | `low of {{degrees}}` | `mínima de {{degrees}}` |
| `rain` | `{{percent}}% de chance de chuva` | `{{percent}}% chance of rain` | `{{percent}}% de probabilidad de lluvia` |
| `warmer` | `Amanhã esquenta {{degrees}}.` | `Tomorrow warms up {{degrees}}.` | `Mañana sube {{degrees}}.` |
| `cooler` | `Amanhã esfria {{degrees}}.` | `Tomorrow cools down {{degrees}}.` | `Mañana baja {{degrees}}.` |
| `same` | `Amanhã, temperatura parecida.` | `Tomorrow, much the same.` | `Mañana, temperatura parecida.` |
| `measured` | `medido às {{time}}` | `measured at {{time}}` | `medido a las {{time}}` |
| `change` | `trocar a cidade` | `change the city` | `cambiar la ciudad` |
| `degrees` | `{ one: '1°', other: '{{n}}°' }` | idem | idem |

**`t.app.weather.rain` não tem chamador**: a busca por `weather.rain` em `src`,
`app`, `e2e` e `scripts` não retorna nada. O cartão escreve o percentual de chuva
à mão como `` `${Math.round(dia.rainChance)}%` `` (`src/home/Mosaic.tsx:337`), sem
usar a frase do dicionário. É uma chave nos três idiomas sem tela — o mesmo defeito
que o P1 do `CLAUDE.md` descreve.

`t.app.weatherPlace` — pt-BR `src/i18n/locales/pt-BR.ts:291-305`, en `en.ts:249-263`,
es `es.ts:254-268`. Os textos que são decisão de produto, em pt-BR:

| Chave | Texto |
|---|---|
| `title` | `Clima` |
| `overline` | `onde fica a fábrica` |
| `why` | `Calor muda o que sai e o que estraga, então o tempo entra na tela inicial. A cidade veio do fuso do aparelho — troque se a fábrica é em outra.` |
| `current` | `Cidade de agora` |
| `none` | `Nenhuma cidade escolhida ainda.` |
| `search` | `Procurar cidade` |
| `searchHint` | `Escreva o nome e escolha na lista.` |
| `searching` | `Procurando…` |
| `noResults` | `Nenhuma cidade com esse nome. Confira a escrita.` |
| `offline` | `Sem internet agora. Procurar cidade precisa dela; o resto do aplicativo não.` |
| `saved` | `Pronto. A tela inicial já mostra o tempo de {{city}}.` |
| `back` | `Voltar` |

O `why` é o texto que o e2e cobra literalmente, junto com a proibição da palavra
"sorvete" na tela (`e2e/flow.mjs:381-386`) — porque o produto vai para as lojas
servir qualquer fábrica.

O docblock do dicionário de clima diz o que a tela **não** faz: *"A tela não diz
'produza mais amanhã': a relação entre calor e venda desta fábrica ainda não está
no livro-razão, e uma frase dessas seria palpite com cara de conta"*
(`src/i18n/locales/pt-BR.ts:270-277`). O mesmo está no topo do módulo
(`src/weather/index.ts:5-11`) e no roadmap, onde "a previsão aplicada" é F4
(`docs/roadmap.md:294-296`).

### 23.29 Como o clima é exercitado

`src/weather/weather.test.ts` (210 linhas) — dez casos, com um "aparelho de
mentira" (`:126-154`) que troca banco por memória e controla a rede:
`now: () => '2026-09-02T12:00:00Z'`, `timeZone: 'America/Sao_Paulo'`, e uma lista
`chamadas` que registra cada URL pedida. A resposta canônica usada em todo o
arquivo (`:29-36`):

```ts
const RESPOSTA = {
  daily: {
    time: ['2026-09-02', '2026-09-03'],
    temperature_2m_max: [30.6, 32.4],
    temperature_2m_min: [19.1, 20.2],
    precipitation_probability_max: [10, 60],
  },
};
```

`e2e/flow.mjs:370-405` dirige `/weather` num navegador de verdade: aceita **as
duas** saídas (achou Recife, ou "Nenhuma cidade com esse nome"), porque a máquina
de teste pode ou não ter internet; o que **não** é aceito é a tela ficar sem
resposta ou o console sujar. A espera é de 20 s **porque o prazo da chamada é 8 s**
— *"uma verificação que espera três reprovaria a tela por ela estar fazendo
exatamente o que prometeu"* (`e2e/flow.mjs:393-398`). E confere que `/more`
continua oferecendo "Clima", porque sem previsão guardada não há cartão na capa
(`:400-404`).

`scripts/shot.mjs:225-247` intercepta o geocoder com uma resposta fixa de São
Paulo e escolhe a cidade pela interface antes de fotografar a capa.

**Não existe mutação** no `scripts/mutate.mjs` apontando para `src/weather/` nem
para `src/components/Sky.tsx` (as entradas de clima simplesmente não estão na
lista).

### 23.30 Lacunas nomeadas

- **Sem teste de `src/notify/index.ts`** (adaptador) e **sem teste de
  `src/components/Sky.tsx`** (faixas e cor).
- **`NotScheduled` sem leitor**: seis códigos calculados, nenhum exibido.
- **`t.app.settings.alerts.never` sem chamador** nos três idiomas.
- **`t.app.weather.rain` sem chamador** nos três idiomas.
- **`temperatureBand` e `FRESH_FOR_MINUTES` exportados sem consumidor externo.**
- **`hoursOld` calculado em `facts.ts:121` e não usado por nenhuma regra.**
- **Canal Android nunca criado** (`setNotificationChannelAsync`: ausente) e
  **`setNotificationHandler` ausente** — comportamento com o app em primeiro plano:
  NÃO ESTÁ NO CÓDIGO.
- **`forecast_days=2` contra `slice(0, 7)`**: a "semana" do cartão nunca tem sete
  dias com a URL atual.
- **Notificação remota / push**: NÃO IMPLEMENTADO.
- **Clima aplicado à demanda** (cruzar calor com venda): NÃO IMPLEMENTADO, e é
  decisão escrita — F4/F7 (`src/weather/index.ts:5-11`; `docs/roadmap.md:294-296,335`).
