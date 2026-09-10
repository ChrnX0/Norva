## 17. Biblioteca de componentes

A pasta `src/components/` tem **41 arquivos soltos** mais a subpasta `cenas/` (4
arquivos), somando **6.359 linhas** nos soltos: 29 componentes (`.tsx`), 6 módulos de
apoio sem React (`campo.ts`, `cena.ts`, `chegada.ts`, `colunas.ts`, `glifos.ts`,
`vida.ts`) e 6 arquivos de teste. Não há `index.ts` de barril — toda tela importa pelo
caminho completo (`@/components/Card`), e o alias `@/` aponta para `src/`
(`tsconfig.json`).

*Estes números foram remedidos em 10 de setembro. O parágrafo dizia "27 arquivos … 3.621
linhas" e as duas metades estavam vencidas — ver §17.31 sobre por que isso acontece aqui
e não acontece no roadmap.*

Nenhum COMPONENTE desta pasta tem teste unitário próprio, e é por desenho: o que dá para
testar sem React foi empurrado para fora do `.tsx`, e é daí que vêm os seis módulos de
apoio e os seis testes ao lado deles (`campo`, `cena`, `colunas`, `vida`, `Reveal` e
`confirm`). O `confirm.test.ts` é o único que não testa vizinho nenhum: ele varre a pasta
`app/` procurando por `Alert` do React Native e por telas que escrevem sem perguntar
(§17.28). O que cobre desenho é `src/domain/spark.ts` e `src/domain/qr.ts` (a geometria
vive no domínio, fora do React, justamente para poder ser testada) e `src/language.test.ts`
(toda tela precisa importar um desenho e usar `Reveal`).

---

### 17.1 O mapa

| Componente | Arquivo | Linhas | Exports | Estado |
|---|---|---|---|---|
| `Alive` | `src/components/Alive.tsx` | 87 | `Alive` | implementado e chamado (por `Card` e por 2 telas) |
| `Bars` | `src/components/Bars.tsx` | 109 | `Bars` | implementado e chamado (1 tela) |
| `Button` | `src/components/Button.tsx` | 143 | `Button` | implementado e chamado (20+ telas) |
| `Card` | `src/components/Card.tsx` | 186 | `Card`, `tint` | implementado e chamado (18+ telas) |
| `Chip` | `src/components/Chip.tsx` | 96 | `Chip`, `Signal`, `priceSignal`, `bandSignal` | implementado e chamado; o tipo `Signal` só é usado dentro do próprio arquivo |
| `CollapsingHeader` | `src/components/CollapsingHeader.tsx` | 144 | `CollapsingHeader` | implementado e chamado (todas as telas com cabeçalho) |
| `Confirm` | `src/components/Confirm.tsx` | 203 | `ConfirmRequest`, `ConfirmProvider`, `useConfirm` | implementado e chamado (13 telas + `app/_layout.tsx`) |
| `CountUp` | `src/components/CountUp.tsx` | 63 | `CountUp` | implementado e chamado (`src/home/Mosaic.tsx`, `src/home/capas/organico.tsx` e 5 telas: perdas, insumos, relatórios, produção, transporte) — era "só o Mosaico", e foi o pedido do dono de *"quero em todas as telas"* que o espalhou |
| `Crash` | `src/components/Crash.tsx` | 96 | `Crash` | implementado e chamado (`app/_layout.tsx`, 2 pontos) |
| `Drain` | `src/components/Drain.tsx` | 69 | `Drain` | implementado e chamado (só `src/home/Mosaic.tsx`) |
| `FactoryScene` | `src/components/FactoryScene.tsx` | 236 | `FactoryScene` | implementado e chamado (só `src/home/Mosaic.tsx`) |
| `Field` | `src/components/Field.tsx` | 88 | `Field` | implementado e chamado (11 telas) |
| `Glyph` | `src/components/Glyph.tsx` | 448 | 26 funções `Glyph*` | 25 chamados por tela; **`GlyphStick` sem chamador** |
| `icons` | `src/components/icons.tsx` | 147 | 9 funções `Icon*` | 6 chamados; **`IconStock`, `IconCost` e `IconLoss` sem chamador** |
| `Landscape` | `src/components/Landscape.tsx` | 194 | `Landscape` | implementado e chamado (só `src/home/Mosaic.tsx`) |
| `ListRow` | `src/components/ListRow.tsx` | 119 | `ListRow` | implementado e chamado (12 telas) |
| `Mark` | `src/components/Mark.tsx` | 27 | `Mark` | implementado; **nenhuma tela o importa** — só `CollapsingHeader` |
| `PulseDot` | `src/components/PulseDot.tsx` | 95 | `PulseDot` | implementado e chamado (`Mosaic`, `app/(tabs)/production.tsx`) |
| `QrCode` | `src/components/QrCode.tsx` | 29 | `QrCode` | implementado e chamado (`app/lots/[id].tsx`) |
| `Reveal` | `src/components/Reveal.tsx` | 77 | `Reveal` | implementado e chamado (`CollapsingHeader` + 18 telas) |
| `Sky` | `src/components/Sky.tsx` | 263 | `temperatureBand`, `skyInk`, `SkyMark`, `TemperatureRange` | `skyInk`/`SkyMark`/`TemperatureRange` chamados por `Mosaic`; **`temperatureBand` só é chamada dentro do próprio arquivo** |
| `Sparkline` | `src/components/Sparkline.tsx` | 123 | `Sparkline` | implementado e chamado (4 telas) |
| `Touchable` | `src/components/Touchable.tsx` | 54 | `Touchable` | implementado e chamado (9 telas) |
| `UnitStepper` | `src/components/UnitStepper.tsx` | 190 | `UnitStepper` | implementado e chamado (`app/picking.tsx:358`, que lhe passa `t.stepper` inteiro) — **foi "SEM CHAMADOR" e deixou de ser**; a separação em engradados é a tela que o usa |
| `WhatsNew` | `src/components/WhatsNew.tsx` | 119 | `WhatsNew` | implementado e chamado (`app/_layout.tsx`) |
| `WhySheet` | `src/components/WhySheet.tsx` | 153 | `WhySheet` | implementado e chamado (`app/recipes/[id].tsx`) |
| — | `src/components/confirm.test.ts` | 63 | (dois testes) | guarda de `Alert`/`useConfirm` |

---

### 17.2 Convenções que atravessam a pasta inteira

Antes dos blocos por componente, as sete regras mecânicas que quase todo arquivo aqui
obedece. Elas não estão escritas num arquivo de convenção — estão repetidas em cada
componente, e é assim que precisam ser reconstruídas.

#### 17.2.1 Toda cor vem de `useTheme()`

Nenhum componente escreve hexadecimal na mão, com **três exceções declaradas**:

1. `QrCode` pinta `#FFFFFF` e `#000000` fixos — *"O QR não herda o tema: em modo
   escuro, um código claro sobre fundo escuro é invertido e metade dos leitores
   recusa"* (`src/components/QrCode.tsx:15-18`).
2. `Landscape` pinta `#F5C66A`/`#FFFFFF` nas janelas da fábrica, `#F7E6B5`/`#FFD76A` no
   sol, `#8EC5FC` na chuva (`src/components/Landscape.tsx:139,153,154,167,173,186`).
3. `Confirm`, `WhatsNew` e `WhySheet` usam `rgba(0,0,0,0.35)` e `rgba(0,0,0,0.45)` nos
   fundos de modal (`Confirm.tsx:159,199`, `WhatsNew.tsx:114`, `WhySheet.tsx:148`).

O guard que proíbe cor crua (`src/language.test.ts:118-131`) roda **só sobre `app/`**,
não sobre `src/components/` — as exceções acima não estão sob teste.

A forma do tema é (`src/theme/ThemeProvider.tsx:17-46`):

| Campo | Tipo | O que é |
|---|---|---|
| `scheme` | `'light' \| 'dark'` | resolvido por `resolveScheme(escolha, aparelho)` |
| `color` | `Palette` | a paleta da cara + esquema no ar |
| `palette` | `Palette` | a mesma coisa, nome usado quando se quer um tom que não é o da área |
| `skin` | `'papel' \| 'organico'` | qual das duas identidades |
| `brand` | `string` | cor da identidade (paleta escolhida no Orgânico; `color.apricot` no Papel) |
| `accent` | `string` | o tom ambiente da ÁREA em que a tela está |
| `type` | escala tipográfica | com serifa nos títulos quando `skin === 'papel'` |
| `space` | `{xs:4, sm:8, md:12, lg:16, xl:22, xxl:32}` | `src/theme/tokens.ts:163` |
| `radius` | por identidade | Papel `{sm:4,md:6,lg:8,xl:10,pill:999}`; Orgânico `{sm:12,md:18,lg:22,xl:28,pill:999}` (`tokens.ts:392,398`) |
| `motion` | tokens de movimento | ver abaixo |

#### 17.2.2 Os tokens de movimento, e quem usa cada um

`src/theme/tokens.ts:177-185`:

```
motion = {
  settle: { damping: 18, stiffness: 140, mass: 1 },
  press:  { damping: 20, stiffness: 400, mass: 0.6 },
  pressScale: 0.97,
  staggerMs: 40,
  pulseMs: 2600,
  breatheMs: 3200,
  countMs: 1250,
}
```

| Token | Quem consome |
|---|---|
| `settle` | `Alive` (entrada), `Reveal` (entrada), `Drain` (enchimento) |
| `press` | `Button`, `Touchable`, `ListRow`, `UnitStepper.StepButton` |
| `pressScale` (0,97) | `Button`, `Touchable`, `ListRow` |
| `staggerMs` (40) | `Alive`, `Reveal` |
| `pulseMs` (2600) | `PulseDot` |
| `breatheMs` (3200) | `Alive` |
| `countMs` (1250) | `CountUp`, `Sparkline` (duração do traço) |

As cinco regras de movimento estão escritas no próprio arquivo de tokens
(`src/theme/tokens.ts:168-176`): *"1. Nothing blinks. Pulses run 2.6-3.2s. 2. At most
two pulsing elements per screen. 3. Only what is actually live may pulse. 4. Motion
never delays information. 5. Reduced-motion turns it all off, and the screen stays
complete."*

#### 17.2.3 O padrão de reduce-motion, copiado em nove componentes

Não existe hook compartilhado. Cada componente animado repete literalmente esta forma:

```tsx
useEffect(() => {
  let cancelled = false;
  void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
    if (cancelled) return;
    if (reduced) { /* estado final, imediato */ return; }
    /* dispara a animação */
  });
  return () => { cancelled = true; };
}, [/* deps */]);
```

| Componente | Consulta `isReduceMotionEnabled`? | O que acontece com movimento reduzido |
|---|---|---|
| `Alive` | sim (`Alive.tsx:59`) | `entrada = 1`, `folego = 0` — escala final, opaco |
| `Bars` | sim (`Bars.tsx:49`) | `grown = 1` — colunas já na altura |
| `CountUp` | sim (`CountUp.tsx:31`) | `setShown(value)` direto |
| `Drain` | sim (`Drain.tsx:44`) | `cheia = 1` |
| `FactoryScene` | sim (`FactoryScene.tsx:80`) | `enche = dayShare ?? 0`, `caixa = shipped ? 1 : 0`; fumaça e sol nunca partem |
| `Landscape` | sim (`Landscape.tsx:82`) | retorno antecipado: nada gira, nada deriva, nada chove animado |
| `PulseDot` | sim (`PulseDot.tsx:62`) | retorno antecipado: o ponto fica, o halo não |
| `Reveal` | sim (`Reveal.tsx:60`) | retorno antecipado — e `shown` já nasce em 1 |
| `Sky` / `SkyMark` | sim (`Sky.tsx:112`) | nada gira, nada deriva |
| `Sky` / `TemperatureRange` | sim (`Sky.tsx:228`) | `grown = 1` |
| `Sparkline` | sim (`Sparkline.tsx:67`) | `drawn = 1`, `settled = 1` — linha inteira e pingo assentado |
| `Button` | **não** | a mola de pressão roda sempre |
| `ListRow` | **não** | idem |
| `Touchable` | **não** | idem |
| `UnitStepper` | **não** | idem |

A assimetria é consistente: **entrada e ciclo consultam o sistema; resposta ao dedo
não.** Não há comentário no código explicando essa fronteira — é leitura do padrão, não
uma decisão escrita. NÃO ESTÁ NO CÓDIGO a justificativa por escrito.

#### 17.2.4 Números tabulares

Todo número que pode ser comparado em coluna carrega `fontVariant: ['tabular-nums']`:
`CountUp` (`CountUp.tsx:59`), `ListRow.trailing` (`ListRow.tsx:118`), `Bars` nos
rótulos de dia (`Bars.tsx:78`), `Field` quando o teclado não é `'default'`
(`Field.tsx:63`), `UnitStepper` no valor e no eco (`UnitStepper.tsx:178-179`),
`WhySheet` nos valores (`WhySheet.tsx:70,137`).

#### 17.2.5 Acessibilidade, por papel

| Papel | Onde |
|---|---|
| `button` | `Button`, `Touchable`, `ListRow` (só quando tem `onPress`), `Confirm` (as duas ações), `Crash`, `WhatsNew`, `UnitStepper.StepButton` |
| `text` | `Chip`, `ListRow` sem `onPress` |
| `header` | o título de `CollapsingHeader` |
| `image` | `Mark`, `QrCode`, `FactoryScene`, todos os `Icon*` e todos os `Glyph*` |
| `radiogroup` / `radio` | `UnitStepper` (segmento de camadas) |
| `accessibilityLiveRegion="polite"` | `Field.hint`, `UnitStepper` (o valor) |
| `accessibilityElementsHidden` | `PulseDot` — o halo não é informação para leitor de tela |

#### 17.2.6 As duas caras

`skin === 'papel'` muda o desenho em cinco componentes, sempre com o mesmo argumento
escrito: o Papel é traço e régua, o Orgânico é bloco e curva.

| Componente | No Papel | No Orgânico |
|---|---|---|
| `Button` | canto `radius.sm`; preenchimento na cor `brand`; ação secundária vira palavra sublinhada (`borderBottomWidth: hairline*2`) | pílula `radius.pill`; preenchimento no `accent` da área; secundária com moldura |
| `Card` | régua no topo, sem fundo, sem borda em volta, sem crachá | fundo lavado, borda inteira, trilho esquerdo e crachá redondo |
| `Chip` | retângulo `radius.sm` | pílula `radius.pill` |
| `CollapsingHeader` | `Mark` de 18px solto na página | `Mark` de 15px dentro de um selo 28×28 com fundo `${accent}22` |
| `SkyMark` | sem halo; traço 1,7 | halo radial; traço 2,2 |
| Cena do topo | `FactoryScene` | `Landscape` |

A espessura do traço dos glifos também é da identidade: as telas calculam
`const traco = skin === 'papel' ? 1.7 : 2.2` (`src/home/Mosaic.tsx:56`) e passam como
`weight`.

#### 17.2.7 O que a suíte obriga

`src/language.test.ts:28` define o que conta como desenho:

```
const DESENHO = /from '@\/components\/(Glyph|icons|Sky|Landscape|FactoryScene)'/;
```

e `:31` define a animação obrigatória: `const ANIMACAO = /\bReveal\b/`. Toda tela de
`app/` (menos `_layout.tsx`) precisa casar com as duas, ou delegar para quem casa —
o único delegante registrado é `app/(tabs)/index.tsx → src/home/Mosaic.tsx`
(`src/language.test.ts:39-41`). A lista de telas por converter (`FALTAM`) **está vazia
desde 4 de setembro** (`src/language.test.ts:55`).

---

### 17.3 `Alive`

**Arquivo:** `src/components/Alive.tsx` (87 linhas). **Estado:** implementado e chamado.

#### Para que serve

Fazer o desenho respirar. É a generalização de duas exceções admitidas na
`FactoryScene`: *"o sol e o floco giram devagar, porque um sol parado num desenho de céu
lê como imagem quebrada"* (`Alive.tsx:20-23`). O pedido do dono está transcrito no
docblock: *"quero todos eles com aquela animação bem suave que aparece naquele desenho
de fábrica do briefing. quero esse padrão em todo o aplicativo"* (`Alive.tsx:18-21`).

O docblock registra também que `motion.breatheMs` estava em `tokens.ts` desde o começo
do projeto e **nada o chamava** — *"mais uma peça sem chamador, agora com um"*
(`Alive.tsx:37-38`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `children` | `ReactNode` | — | o desenho que vai respirar |
| `index` | `number` | `0` | posição na cascata, para o crachá assentar junto com o cartão |
| `style` | `ViewStyle` | — | estilo aplicado ao `Animated.View` externo |

#### Comportamento

Dois valores compartilhados: `entrada` e `folego` (`Alive.tsx:54-55`).

- **Chegada:** `entrada.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle))`
  (`Alive.tsx:66`) — 40 ms por posição, mola `settle`.
- **Respiração:** `folego` é `withRepeat(withSequence(withTiming(1, {duration: motion.breatheMs, easing: Easing.inOut(Easing.quad)}), withTiming(0, {mesma coisa})), -1, false)`
  (`Alive.tsx:67-74`) — 3.200 ms para cada lado, infinito.
- **Estilo:** `opacity: entrada.value`, `transform: [{ scale: 0.84 + entrada.value * 0.16 + folego.value * 0.035 }]`
  (`Alive.tsx:82-83`). Ou seja: a escala vai de 0,84 a 1,0 na entrada, e depois oscila
  3,5 centésimos. O docblock faz a conta: *"em vinte e seis pixels isso é menos de um
  pixel de viagem"* (`Alive.tsx:34`).
- **Reduce-motion:** `entrada.value = 1; folego.value = 0` (`Alive.tsx:62-63`) — o
  desenho fica inteiro, no tamanho final, opaco.

#### Onde é usado

- `src/components/Card.tsx:154` (Papel, sem crachá) e `:165` (Orgânico, dentro do
  crachá) — todo cartão com ícone respira automaticamente.
- `app/inputs/index.tsx:178` — filtros do almoxarifado, com comentário explicando:
  *"o crachá do cartão faz isso pelo `Card`, e aqui o glifo está solto, então o `Alive`
  entra na mão"* (`app/inputs/index.tsx:175-177`).
- `app/transfer.tsx:386` — mesma justificativa (`app/transfer.tsx:384-385`).

---

### 17.4 `Bars`

**Arquivo:** `src/components/Bars.tsx` (109 linhas). **Estado:** implementado e chamado
por uma tela.

#### Para que serve

Sete colunas com o ritmo da semana. O docblock diz o problema que resolve: *"É a
primeira coisa que a capa passa a responder e nunca respondia: **o que é normal
aqui**. O número de hoje sozinho não diz se o dia foi bom — 400 picolés numa fábrica que
faz 380 todo dia é rotina, e numa que faz 1.200 é uma parada de manutenção que ninguém
avisou"* (`Bars.tsx:16-19`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `series` | `readonly { date: string; total: number }[]` | — | sete dias, do mais antigo para hoje |
| `labels` | `readonly string[]` | — | a inicial de cada dia, já no idioma da tela |
| `hue` | `string` | `accent` | a cor do dia de hoje |
| `height` | `number` | `56` | altura da caixa |

#### Comportamento e decisões

- **A régua é a própria semana**, não uma meta: `const peak = Math.max(...series.map((d) => d.total), 1)`
  (`Bars.tsx:58`). Justificativa escrita: *"fábrica nenhuma tem meta cadastrada aqui, e
  inventar uma régua para o desenho ficar bonito seria número que ninguém pode
  conferir"* (`Bars.tsx:22-24`).
- **Hoje é a última posição:** `const today = i === series.length - 1` (`Bars.tsx:64`).
- **Cor:** hoje leva `hue ?? accent`; os outros dias levam `tint(hue ?? accent, 0.28)`
  (`Bars.tsx:72`) — a mesma cor a 28% de alfa.
- **Rótulo:** `color.ink` para hoje, `color.inkFaint` para os outros, com
  `fontVariant: ['tabular-nums']` (`Bars.tsx:78`).
- **Piso de 3 pixels:** `height: Math.max(3, share * height * grown.value)`
  (`Bars.tsx:105`), com o comentário *"O piso de três pixels é o que faz um dia parado
  continuar sendo um dia: sem ele a coluna zerada desaparece e a semana ganha um buraco
  que ninguém sabe ler"* (`Bars.tsx:101-103`). E no topo do arquivo: *"Coluna de dia
  parado é um risco, não um vazio: zero é um fato sobre a fábrica, e some-lo do desenho
  contaria uma semana que não aconteceu"* (`Bars.tsx:27-29`).
- **Animação:** `grown` sobe com `withDelay(120, withSpring(1, { damping: 16, stiffness: 120 }))`
  (`Bars.tsx:51`) — mola local, **não** `motion.settle`. Com reduce-motion, `grown = 1`.
- **Layout:** linha com `alignItems: 'flex-end'`, `gap: space.xs`, `marginTop: space.md`
  (`Bars.tsx:61`); cada coluna com `borderRadius: 4` (`Bars.tsx:108`).

#### Onde é usado

`src/home/Mosaic.tsx:137`, na peça `producao`, com `hue={palette.apricot}` e
`labels={data.series.map((d) => formatWeekdayInitial(d.date, locale))}`. Só é
desenhado quando `data.series.length > 0` (`src/home/Mosaic.tsx:136`).

---

### 17.5 `Button`

**Arquivo:** `src/components/Button.tsx` (143 linhas). **Estado:** implementado e
chamado por mais de vinte telas.

#### Para que serve

A ação primária. *"One per screen, labelled with a verb, sitting within thumb reach"*
(`Button.tsx:12-13`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `label` | `string` | — | o texto; vira também `accessibilityLabel` |
| `onPress` | `() => void` | — | opcional |
| `variant` | `'primary' \| 'ghost'` | `'primary'` | massa de cor contra contorno/sublinhado |
| `icon` | `(color: string) => ReactNode` | — | desenhado à esquerda do rótulo, **recebendo a cor já resolvida** |
| `weighty` | `boolean` | `false` | ações pesadas também vibram |
| `disabled` | `boolean` | `false` | `opacity: 0.45` e `accessibilityState.disabled` |
| `style` | `ViewStyle` | — | último da pilha de estilos |

A prop `icon` recebe a cor por um motivo escrito: *"It receives the colour so the icon
can never disagree with the text it sits beside"* (`Button.tsx:33-34`). Ela é chamada
com `isPrimary ? color.onAccent : color.inkMuted` (`Button.tsx:122`).

#### Comportamento

- **Háptica:** `if (weighty) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`
  antes de `onPress?.()` (`Button.tsx:89-90`).
- **Mola:** `transform: [{ scale: withSpring(pressed ? motion.pressScale : 1, motion.press) }]`
  (`Button.tsx:75`), dirigida por `useState`, não por escrita direta no shared value.
  Motivo escrito: *"Same physics, and it keeps the press readable from React - mutating
  a shared value inside a callback is invisible to everything else"* (`Button.tsx:71-73`).
- **A cor da ação é do aplicativo, não da seção** (`Button.tsx:54-67`):
  `const preenchimento = papel ? brand : accent` (`Button.tsx:68`). O relato: *"o botão
  pintava com o acento da área, e numa folha de contato as quatro telas apareceram com
  quatro botões de cores diferentes — laranja na produção, rosa no transporte"*. No
  Orgânico o acento por área **continua**, por escolha do dono.
- **Forma por identidade:** `borderRadius: papel ? radius.sm : radius.pill`
  (`Button.tsx:96`). Relato: o dono circulou as "caixas" do outro tema e o botão era a
  última (`Button.tsx:44-51`).
- **Secundário no Papel é sublinhado** (`Button.tsx:101-116`): `borderWidth: 0`,
  `borderBottomWidth: StyleSheet.hairlineWidth * 2`, `borderBottomColor: color.lineStrong`,
  `borderRadius: 0`, `paddingVertical: space.md`, `paddingHorizontal: space.sm`.
  Motivo: *"a ficha de uma receita com quatro linhas tem doze ações secundárias, e doze
  molduras empilhadas são doze caixas"*.
- **Base:** `flexDirection: 'row'`, `gap: 10`, centralizado nos dois eixos,
  `borderWidth: StyleSheet.hairlineWidth * 2` (`Button.tsx:136-142`); no estado normal
  `paddingVertical: space.lg` (16) e `paddingHorizontal: space.xl` (22)
  (`Button.tsx:97-98`).
- **Texto:** `type.body` com `fontWeight: '600'` (`Button.tsx:125-126`).
- **Não consulta reduce-motion.**

#### Onde é usado

`app/(tabs)/production.tsx`, `app/(tabs)/transport.tsx`, `app/assistant.tsx`,
`app/catalog.tsx`, `app/inputs/[id].tsx`, `app/inputs/index.tsx`, `app/inputs/new.tsx`,
`app/losses.tsx`, `app/lots/[id].tsx`, `app/orders/index.tsx`, `app/orders/new.tsx`,
`app/places.tsx`, `app/production/new.tsx`, `app/products/index.tsx`,
`app/products/new.tsx`, `app/purchase.tsx`, `app/recipes/[id].tsx`, `app/settings.tsx`,
`app/transfer.tsx`, `app/weather.tsx`.

`weighty` aparece em 11 pontos (entre eles `app/production/new.tsx:606`,
`app/transfer.tsx:608`, `app/purchase.tsx:439`, `app/inputs/new.tsx:509`).
`variant="ghost"` aparece 39 vezes.

---

### 17.6 `Card`

**Arquivo:** `src/components/Card.tsx` (186 linhas). **Estado:** implementado e chamado.
Exporta **dois** símbolos: `Card` e `tint`.

#### `tint(hex, alpha)`

```ts
export function tint(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(clamped * 255).toString(16).padStart(2, '0')}`;
}
```

(`Card.tsx:17-20`.) Concatena o alfa em hexadecimal a uma cor de seis dígitos. Motivo
escrito: *"Fazer isso aqui, e não com `rgba(...)` na mão, é o que permite a mesma linha
funcionar nos dois esquemas: o tom sai da paleta, e só a força muda"* (`Card.tsx:13-15`).

Consumidores de `tint`: `Bars.tsx:10`, `Drain.tsx:9`, `Sparkline.tsx:11`,
`app/lots/[id].tsx:4`, e o próprio `Card`.

#### O cartão — para que serve

O docblock guarda a mudança de regra inteira (`Card.tsx:22-42`): *"**A regra anterior
era o trilho de 3px e mais nada**, e ela tinha um motivo escrito: cartão inteiro
colorido cansa quem olha a tela oito horas. O dono olhou o resultado e disse o que ela
custou — *'por que tudo esse tipo de card? tem que ter um pouco de fofura'*."* O acordo
registrado: a cor entra como **fundo lavado** de 8% a 12%, o trilho vira borda inteira
na mesma cor, e o cartão passa a poder ter ícone e título.

#### Props

```ts
type Tone = 'plain' | 'area' | 'danger' | 'warning';
```

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `children` | `ReactNode` | — | o conteúdo |
| `tone` | `Tone` | `'plain'` | resolve a cor quando `hue` não é dado |
| `hue` | `string` | — | a cor deste cartão; ganha de `tone` |
| `style` | `ViewStyle` | — | último da pilha |

E um par discriminado (`Card.tsx:63-79`):

| Variante | Props |
|---|---|
| com cabeça | `icon: (color: string) => ReactNode` **obrigatório**, `title?: string` |
| sem cabeça | `icon?: undefined`, `title?: undefined` |

O motivo do par está escrito: *"Cartão sem cabeça: o conteúdo fala por si. Título aqui
seria escrito e não desenhado — o cabeçalho inteiro só existe quando há ícone, e um
`title` sozinho sumia em silêncio. Dezoito telas estão sendo reescritas com este
componente, e 'sumiu e ninguém viu' é o defeito que mais se multiplica numa reescrita
larga"* (`Card.tsx:71-77`). **Um `title` sem `icon` não compila.**

#### Resolução da cor

```ts
const toneColor = hue ?? (tone === 'area' ? accent
                  : tone === 'danger' ? color.danger
                  : tone === 'warning' ? color.warning : null);
```

(`Card.tsx:82-90`.) `tone='plain'` sem `hue` resulta em `null` — cartão neutro.

#### As duas formas

| | Orgânico (`Card.tsx:137-144`) | Papel (`Card.tsx:120-136`) |
|---|---|---|
| fundo | `toneColor ? tint(toneColor, wash) : color.surface` | `'transparent'` |
| borda | `borderColor: toneColor ? tint(toneColor, edge) : color.line`, `borderWidth: hairline` | só topo |
| canto | `radius.xl` | `0` |
| padding | `space.lg` nos quatro lados | `paddingTop: space.md`, `paddingBottom: space.lg`, `paddingHorizontal: 0` |
| trilho | `borderLeftWidth: toneColor ? RAIL_WIDTH : hairline`, cor `toneColor ?? color.line` | `borderTopWidth: toneColor ? 1.5 : hairline`, cor `toneColor ?? color.line` |
| crachá | `View` 40×40, fundo `tint(toneColor ?? accent, scheme === 'dark' ? 0.22 : 0.14)`, `borderRadius: radius.lg` | **não existe** |

`RAIL_WIDTH = 3` vem de `src/theme/tokens.ts:188`.

As forças do lavado dependem do esquema (`Card.tsx:94-95`):
`const wash = scheme === 'dark' ? 0.13 : 0.08;` e `const edge = scheme === 'dark' ? 0.34 : 0.24;`
— *"O escuro aguenta mais cor que o claro: sobre papel quase branco, doze por cento de
âmbar já vira um cartão amarelo"* (`Card.tsx:92-93`).

O parágrafo que justifica a forma do Papel está inteiro em `Card.tsx:97-113`, incluindo
a citação do dono: *"as cores e todo o resto não combinam. como é que essas 'caixas'
continuam aí?"*, e a conclusão: *"A forma do Papel é editorial: **régua em cima, sem
fundo, sem borda em volta, sem crachá.**"*

#### O cabeçalho

Quando há `icon`, monta uma linha (`Card.tsx:148-174`) com `gap: space.sm` e
`marginBottom: space.sm`. O ícone é sempre envolvido por `<Alive>`; o título usa
`type.cardTitle`, cor `color.ink`, `flex: 1`, `numberOfLines={1}`. A cor passada ao
ícone é `toneColor ?? accent`.

#### Onde é usado

`app/(tabs)/more.tsx`, `app/(tabs)/production.tsx`, `app/(tabs)/reports.tsx`,
`app/(tabs)/transport.tsx`, `app/assistant.tsx`, `app/catalog.tsx`,
`app/inputs/[id].tsx`, `app/inputs/index.tsx`, `app/inputs/new.tsx`, `app/losses.tsx`,
`app/lots/[id].tsx`, `app/orders/index.tsx`, `app/orders/new.tsx`, `app/places.tsx`,
`app/production/new.tsx`, `app/products/index.tsx`, `app/products/new.tsx`,
`app/purchase.tsx`, `app/recipes/[id].tsx`, `app/recipes/index.tsx`,
`app/settings.tsx`, `app/transfer.tsx`, `app/weather.tsx`, `src/home/Mosaic.tsx`,
`src/home/Peca.tsx`.

---

### 17.7 `Chip`

**Arquivo:** `src/components/Chip.tsx` (96 linhas). **Estado:** implementado e chamado.
Exporta quatro símbolos: o tipo `Signal`, o componente `Chip`, e duas funções de
tradução de juízo para cor.

#### `Signal`

```ts
export type Signal = 'ok' | 'warning' | 'danger' | 'neutral';
```

(`Chip.tsx:6`.) Nenhum arquivo fora de `Chip.tsx` importa este tipo por nome — ele
chega às telas por inferência, no retorno de `priceSignal`/`bandSignal`.

#### `Chip({ signal, label })`

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `signal` | `Signal` | — | escolhe a cor: `color[signal]` |
| `label` | `string` | — | **obrigatório** |

*"`label` is required and there is no icon-only variant on purpose. Color never travels
alone: some people are colorblind, and a phone screen under warehouse lighting loses hue
long before it loses text"* (`Chip.tsx:10-13`).

**Desenho:** linha com um ponto de 7×7 e `borderRadius: 4` (`Chip.tsx:53`) e o texto em
`type.caption` com `fontWeight: '500'`, os dois na mesma cor. Contorno de
`StyleSheet.hairlineWidth * 2`, `alignSelf: 'flex-start'`, `paddingVertical: space.xs + 1`,
`paddingHorizontal: space.md`, `gap: space.sm - 1` (`Chip.tsx:32-34, 46-53`).
`borderRadius: papel ? radius.sm : radius.pill` (`Chip.tsx:31`) — *"A pílula é do
Orgânico; no Papel a etiqueta é reta, como um carimbo"* (`Chip.tsx:21`).
`accessibilityRole="text"` e `accessibilityLabel={label}` (`Chip.tsx:37-38`).

#### `priceSignal(verdict: PriceVerdict | null): Signal`

```ts
if (verdict === 'wellAbove') return 'warning';
if (verdict === 'cheaper') return 'ok';
return 'neutral';
```

(`Chip.tsx:65-69`.) `PriceVerdict = 'wellAbove' | 'smallChange' | 'cheaper'`
(`src/domain/cost.ts:217`).

Mora ao lado do chip e não no domínio porque *"a signal name is a fact about the
interface, not about money"*, e principalmente porque **não pode ser escrita duas
vezes**: *"the storeroom screen and the purchase screen were colouring the same change
differently - a 1% fall read as 'cheaper' in one and 'no real change' in the other"*
(`Chip.tsx:58-63`).

Chamada em `app/inputs/[id].tsx:6` e `app/purchase.tsx:6`.

#### `bandSignal(band: VolumeBand | null): Signal | undefined`

```ts
if (band === 'zerado' || band === 'vermelho') return 'danger';
if (band === 'amarelo') return 'warning';
if (band === 'verde') return 'ok';
if (band === 'azul') return 'neutral';
return undefined;
```

(`Chip.tsx:83-95`.) `VolumeBand = 'zerado' | 'vermelho' | 'amarelo' | 'verde' | 'azul'`
(`src/domain/alerts.ts:131`).

Duas decisões escritas:

1. **`zerado` e `vermelho` são a mesma cor de propósito** — *"acabar e estar acabando são
   o mesmo grau de urgência para o olho, e é a FRASE que os separa ('acabou' contra '20%
   do cheio'). Inventar uma quinta cor para caber a diferença faria a escala deixar de
   ser lida de longe"* (`Chip.tsx:78-82`).
2. **Sem faixa não há cor.** O retorno `undefined` é cicatriz: *"isto devolvia
   'neutral', que pintava uma barra cinza em TODA linha do almoxarifado. A régua não
   cadastrada virava enfeite em cada item, que é o oposto exato do que a faixa existe
   para fazer"* (`Chip.tsx:91-95`).

Chamada em `app/inputs/index.tsx:7`.

#### Onde o `Chip` é usado

`app/(tabs)/production.tsx`, `app/(tabs)/transport.tsx`, `app/assistant.tsx`,
`app/catalog.tsx`, `app/inputs/[id].tsx`, `app/inputs/new.tsx`, `app/orders/index.tsx`,
`app/places.tsx`, `app/production/new.tsx`, `app/products/new.tsx`, `app/purchase.tsx`,
`app/settings.tsx`, `app/transfer.tsx`.

---

### 17.8 `CollapsingHeader`

**Arquivo:** `src/components/CollapsingHeader.tsx` (144 linhas). **Estado:**
implementado e chamado por praticamente toda tela com cabeçalho.

#### Para que serve

O título grande que encolhe ao rolar — *"the most recognizable part of the One UI
signature, and the reason the top of every screen is breathing room rather than a row of
buttons. Actions live in the lower half of the screen, within thumb reach. Nothing
important ever sits up here"* (`CollapsingHeader.tsx:20-27`).

Na prática, este componente é o **casco de toda tela**: ele desenha o cabeçalho, monta o
`ScrollView`, resolve os insets e **envolve cada filho num `Reveal`**.

#### Constantes

```ts
const EXPANDED = 34;   // fontSize do título no topo
const COLLAPSED = 22;  // fontSize depois de rolar
const RANGE = 72;      // pixels de rolagem em que a transição acontece
```

(`CollapsingHeader.tsx:16-18`.)

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `title` | `string` | — | o título grande, `accessibilityRole="header"` |
| `overline` | `string` | — | linha acima, em CAIXA ALTA, some ao rolar |
| `children` | `ReactNode` | — | os cartões da tela |

#### Comportamento

- **Interpolações** (`CollapsingHeader.tsx:53-60`):
  - título: `fontSize: interpolate(scrollY, [0, 72], [34, 22], Extrapolation.CLAMP)`
  - overline: `opacity: interpolate(scrollY, [0, 36], [1, 0], CLAMP)` e
    `height: interpolate(scrollY, [0, 36], [18, 0], CLAMP)`
- **Altura da barra de abas lida do contexto, não do hook** (`CollapsingHeader.tsx:40-46`):
  `const tabBar = useContext(BottomTabBarHeightContext) ?? 0;`. Motivo escrito:
  *"Read from the context and NOT from `useBottomTabBarHeight()`: that hook throws
  outside a tab screen, and nine screens in this app - a recipe, an input, a purchase -
  are pushed on top of the bar rather than being tabs. A hook that throws would take all
  nine down to save one line here."*
- **`keyboardShouldPersistTaps="handled"`** (`CollapsingHeader.tsx:110`), com o relato
  do bug: *"With the soft keyboard up, React Native's default (`never`) spends the first
  tap dismissing it, so the confirm button only answers on the second. On a factory floor
  that reads as 'the app did not save'... Invisible on the web and to the e2e suite: a
  browser has no keyboard that rises"* (`CollapsingHeader.tsx:105-109`).
- **A cascata dada a toda tela de uma vez** (`CollapsingHeader.tsx:117-131`):

  ```tsx
  {Children.toArray(children).map((filho, i) => (
    <Reveal key={i} index={i}>{filho}</Reveal>
  ))}
  ```

  `Children.toArray` faz duas coisas: dá o índice do escalonamento e **descarta os nulos**
  que as telas devolvem quando um cartão não se aplica — *"sem isso, um cartão ausente
  contaria como posição e abriria um buraco de quarenta milissegundos no meio da
  sequência"* (`CollapsingHeader.tsx:123-126`). O pedido do dono está transcrito:
  *"isso é lindo e preenche os olhos, claro que não é para tirar a atenção"*.
  A capa é a exceção conhecida — os cartões dela moram dentro de `Mosaic`, então o casco
  vê um filho só e o escalonamento de verdade continua lá dentro
  (`CollapsingHeader.tsx:132-135`).
- **A marca:** `skin === 'papel'` → `<Mark size={18} color={accent} />` solto; senão
  uma `View` 28×28 com `backgroundColor: \`${accent}22\`` e `borderRadius: 9`, com
  `<Mark size={15} color={accent} />` dentro (`CollapsingHeader.tsx:73-81`).
- **Espaçamentos:** cabeçalho com `paddingTop: insets.top + space.sm`,
  `paddingHorizontal: space.lg`, `paddingBottom: space.md`; conteúdo com
  `paddingHorizontal: space.lg`, `paddingBottom: insets.bottom + space.xxl + tabBar`,
  `gap: space.md` (`CollapsingHeader.tsx:66-69, 111-115`).
- **Título:** `color.ink`, `fontWeight: '600'`, `letterSpacing: -0.8`
  (`CollapsingHeader.tsx:84`).
- **Overline:** `type.overline`, `color.inkFaint`, `numberOfLines={1}`, e o texto é
  passado por `.toUpperCase()` (`CollapsingHeader.tsx:95-97`).
- **`scrollEventThrottle={16}`** (`CollapsingHeader.tsx:104`).

#### Onde é usado

Vinte e duas telas: `app/(tabs)/index.tsx`, `app/(tabs)/more.tsx`,
`app/(tabs)/production.tsx`, `app/(tabs)/reports.tsx`, `app/(tabs)/transport.tsx`,
`app/assistant.tsx`, `app/catalog.tsx`, `app/inputs/[id].tsx`, `app/inputs/index.tsx`,
`app/inputs/new.tsx`, `app/losses.tsx`, `app/lots/[id].tsx`, `app/orders/index.tsx`,
`app/orders/new.tsx`, `app/places.tsx`, `app/production/new.tsx`,
`app/products/index.tsx`, `app/products/new.tsx`, `app/purchase.tsx`,
`app/recipes/[id].tsx`, `app/recipes/index.tsx`, `app/settings.tsx`,
`app/transfer.tsx`, `app/weather.tsx`.

---

### 17.9 `Confirm`

**Arquivo:** `src/components/Confirm.tsx` (203 linhas). **Estado:** implementado e
chamado. Exporta `ConfirmRequest`, `ConfirmProvider` e `useConfirm`.

#### Para que serve

A confirmação própria do aplicativo, substituindo `Alert.alert`. O motivo é um bug
real: *"It exists because `Alert` is a no-op on the web: every save in this app was
asking a question nobody was shown and waiting for an answer that never came, so the
whole thing was quietly read-only in a browser and nothing said so"*
(`Confirm.tsx:10-13`).

E o motivo de continuar existindo depois do bug: *"The confirmations here are not 'are
you sure' - they spell out what is about to happen, in words, with the numbers written
out, which is the one thing standing between a tired person and a wrong entry"*
(`Confirm.tsx:15-18`).

#### `ConfirmRequest`

```ts
export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Draws it as a centred dialog in the danger colour, and has no default. */
  destructive?: boolean;
  /** Drops the cancel button: for telling, not asking. */
  acknowledge?: boolean;
};
```

(`Confirm.tsx:25-34`.)

#### `ConfirmProvider`

Guarda um `pending: Pending | null` em estado e uma **fila** em `useRef<Pending[]>([])`
(`Confirm.tsx:41-42`). `ask` devolve uma `Promise<boolean>` e, se já houver uma pergunta
no ar, empurra a nova para a fila — *"Two questions at once would stack invisibly; the
second waits"* (`Confirm.tsx:49-51`). `settle(answer)` resolve a atual e puxa
`queue.current.shift() ?? null` (`Confirm.tsx:58-63`).

#### `useConfirm()`

```ts
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const ask = useContext(ConfirmContext);
  return ask ?? (async () => false);
}
```

(`Confirm.tsx:81-84`.) Fora do provedor resolve `false` em vez de lançar: *"a screen
that cannot ask must not act, and refusing to act is always the safe direction"*
(`Confirm.tsx:77-79`).

#### `ConfirmSurface` — a forma carrega o aviso

`const destructive = request.destructive ?? false;` e
`const confirmColor = destructive ? color.danger : accent;` (`Confirm.tsx:97-98`).

| | destrutivo | normal |
|---|---|---|
| `Modal.animationType` | `'fade'` | `'slide'` |
| forma | diálogo centrado, fundo `rgba(0,0,0,0.45)`, `padding: space.lg`; caixa com `borderRadius: radius.xl`, `padding: space.xl`, `width: '100%'`, `maxWidth: 420` | folha subindo do fundo, `borderTopLeftRadius`/`borderTopRightRadius: radius.xl`, `paddingBottom: insets.bottom + space.lg` |
| fundo tocável | não há | `Pressable` com `flex: 1`, `rgba(0,0,0,0.35)`, `accessibilityLabel` = rótulo de cancelar |
| pegador | não | `View` 38×4, `borderRadius: 2`, `alignSelf: 'center'`, `marginBottom: 16` |

*"It rises from the bottom, except when it is destructive: a centred dialog is reserved
for the actions that cannot be undone, so the shape itself carries a warning before the
words are read"* (`Confirm.tsx:20-22`).

#### O corpo

- título em `type.section`, cor `color.ink` (`Confirm.tsx:102`);
- mensagem dentro de um `ScrollView` com `maxHeight: 260`, em `type.body`,
  `color.inkMuted`, `marginTop: space.md` (`Confirm.tsx:104-108`);
- botão de confirmar: fundo `confirmColor`, `borderRadius: radius.pill`,
  `paddingVertical: space.lg`, texto `color.onAccent` em 600
  (`Confirm.tsx:111-126`). Rótulo: `request.confirmLabel ?? t.app.confirm.confirm`
  (pt-BR: **"Confirmar"**, `src/i18n/locales/pt-BR.ts:59`);
- botão de cancelar, **omitido quando `acknowledge`** (`Confirm.tsx:128`): contorno
  `color.lineStrong` de `hairlineWidth * 2`, mesma pílula, texto `color.inkMuted`.
  Rótulo: `request.cancelLabel ?? t.app.confirm.cancel` (pt-BR: **"Cancelar"**);
- `onRequestClose` responde `false` (`Confirm.tsx:156`).

A seção `app.confirm` do dicionário tem cinco chaves (`src/i18n/locales/pt-BR.ts:58-64`):
`confirm: 'Confirmar'`, `cancel: 'Cancelar'`, `adjust: 'Ajustar'`,
`understood: 'Entendi'`, `close: 'Fechar'`.

#### Onde é usado

`ConfirmProvider` envolve o `Stack` inteiro em `app/_layout.tsx:110`. `useConfirm()` é
chamado em 13 telas: `app/(tabs)/transport.tsx`, `app/assistant.tsx`,
`app/inputs/[id].tsx`, `app/inputs/new.tsx`, `app/lots/[id].tsx`,
`app/orders/index.tsx`, `app/orders/new.tsx`, `app/production/new.tsx`,
`app/products/new.tsx`, `app/purchase.tsx`, `app/recipes/[id].tsx`, `app/settings.tsx`,
`app/transfer.tsx`.

`destructive: true` aparece em três lugares: `app/lots/[id].tsx:130`,
`app/settings.tsx:296`, `app/inputs/[id].tsx:387`. `acknowledge: true` aparece em dez.

---

### 17.10 `CountUp`

**Arquivo:** `src/components/CountUp.tsx` (63 linhas). **Estado:** implementado e
chamado — só por `src/home/Mosaic.tsx`.

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `value` | `number` | — | o valor final |
| `format` | `(value: number) => string` | — | como cada quadro é escrito |
| `style` | `TextStyle` | — | estilo do `Text` |

#### Comportamento

- Estado `shown`, inicializado com `value` (`CountUp.tsx:25`).
- Com movimento reduzido: `setShown(value)` e acabou (`CountUp.tsx:33-36`).
- Senão, laço de `requestAnimationFrame` (`CountUp.tsx:38-49`):
  - `from = 0`, `start = Date.now()`
  - `progress = Math.min(1, elapsed / motion.countMs)` → 1.250 ms
  - `eased = 1 - Math.pow(1 - progress, 3)` (cúbica de saída)
  - `setShown(Math.round(from + (value - from) * eased))`
- Limpeza cancela o quadro pendente (`CountUp.tsx:52-55`).
- **O valor final é alcançável desde o primeiro quadro:**
  `accessibilityLabel={format(value)}` no `Text`, enquanto o corpo mostra
  `format(shown)` (`CountUp.tsx:59-60`). *"The rule this obeys is the one that keeps
  motion honest: animation never delays information"* (`CountUp.tsx:8-10`).
- `fontVariant: ['tabular-nums']` fixo — *"without fixed-width digits the column dances
  on every update and the eye loses its place"* (`CountUp.tsx:12-13`).

#### Onde é usado

`src/home/Mosaic.tsx:127` (produção de hoje, `style` = `type.figure` com `color.ink`),
`:189` (caixas que saíram) e `:433`.

---

### 17.11 `Crash`

**Arquivo:** `src/components/Crash.tsx` (96 linhas). **Estado:** implementado e chamado.

#### Para que serve

A tela de falha. *"Without this they get a blank screen, and a blank screen is the worst
thing this app can do to someone who was already unsure about trusting software with
their money. They cannot tell a crash from a bug from their own mistake, so they assume
it was theirs and stop using it"* (`Crash.tsx:10-13`).

Três regras escritas (`Crash.tsx:15-24`):

1. **Dizer primeiro que nada se perdeu**, *"because it is the only question they
   actually have. It is true by construction: every write is committed locally in a
   transaction before any screen draws it."*
2. **Um botão que funciona.** *"'Tentar de novo' gets them back to a working screen; a
   stack trace does not."*
3. **Guardar o detalhe técnico, dobrado.** *"It is the only description of the failure
   that will ever exist, since nobody is going to reproduce this on a phone in a cold
   room."*

#### Props

| Prop | Tipo | O que faz |
|---|---|---|
| `error` | `Error` | mostrado no bloco técnico |
| `retry` | `() => void` | o botão |

#### Textos (pt-BR, `src/i18n/locales/pt-BR.ts:44-50`)

| Chave | Texto |
|---|---|
| `t.app.crash.title` | "Alguma coisa travou aqui" |
| `t.app.crash.reassurance` | "Nada do que você registrou se perdeu. O aplicativo guarda cada lançamento no aparelho no momento em que você confirma, então é só voltar e continuar de onde parou." |
| `t.app.crash.retry` | "Tentar de novo" |
| `t.app.crash.detail` | "DETALHE TÉCNICO" |

#### Desenho

`flex: 1`, fundo `color.paper`, `paddingTop: insets.top + space.xl`,
`paddingBottom: insets.bottom + space.xl`, `paddingHorizontal: space.lg`
(`Crash.tsx:32-41`). Título em `type.section`; tranquilizador em `type.body`
`color.inkMuted`. O botão é **`color.ink` com texto `color.paper`** — não a cor de
acento — em pílula `radius.pill` (`Crash.tsx:53-64`). O bloco técnico fica empurrado
para baixo (`flex: 1, justifyContent: 'flex-end'`), num `ScrollView` com fundo
`color.sunken`, `borderRadius: radius.md`, `padding: space.md`, `maxHeight: 180`,
texto em `type.code` (`Crash.tsx:67-87`). O conteúdo é:

```
{brand.name} · {error.name}: {error.message}\n\n{error.stack}
```

(`Crash.tsx:83-84`), com `brand.name = 'NORVA'` (`src/config/brand.ts:12`).

#### Onde é usado

`app/_layout.tsx:29` — dentro do `ErrorBoundary` que o Expo Router chama quando uma
tela lança — e `app/_layout.tsx:89`, quando `ensureStarterData()` falha. Nos dois casos
está envolvido por `SafeAreaProvider > LocaleProvider > AppearanceProvider >
ThemeProvider`, porque precisa de tema e de dicionário para desenhar.

---

### 17.12 `Drain`

**Arquivo:** `src/components/Drain.tsx` (69 linhas). **Estado:** implementado e chamado
— só por `src/home/Mosaic.tsx`.

#### Para que serve

*"Quanto ainda resta, como uma barra que ENCHE até onde deveria estar. Serve para as
duas perguntas que a capa faz sobre tempo: quantos dias o estoque dura, e quantos dias
faltam para um lote vencer. As duas têm a mesma forma — uma fração de um horizonte — e
nenhuma delas tem meta cadastrada, então o horizonte é dito por quem chama, e a barra
nunca inventa régua"* (`Drain.tsx:13-19`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `share` | `number` | — | quanto resta, de 0 a 1; fora da faixa é preso |
| `hue` | `string` | `accent` | a cor no estado normal |
| `height` | `number` | `6` | altura da barra, que também é o raio |

#### Comportamento

- `const preso = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));`
  (`Drain.tsx:37`) — `NaN` vira zero.
- **A cor é regra, não decoração:** `const cor = preso <= 0.2 ? color.warning : (hue ?? accent);`
  (`Drain.tsx:38`). *"abaixo de um quinto do horizonte ela vira o tom de alerta, porque
  é aí que a informação muda de 'normal' para 'decida hoje'"* (`Drain.tsx:20-22`).
- **A barra existe cheia:** *"sumir com o desenho no estado bom faria o cartão pular de
  forma quando a fábrica está bem, que é justamente quando ninguém quer susto"*
  (`Drain.tsx:22-24`).
- Animação: `cheia = withDelay(90, withSpring(1, motion.settle))`; reduzido → 1
  (`Drain.tsx:46`).
- Largura: `` `${Math.max(2, preso * 100 * cheia.value)}%` `` (`Drain.tsx:54`) — piso de
  2%.
- Trilho: `borderRadius: height`, fundo `tint(cor, 0.18)`, `overflow: 'hidden'`
  (`Drain.tsx:59-64`).

#### Onde é usado

`src/home/Mosaic.tsx:570` (`share={Math.min(1, data!.cover[0].daysLeft / 30)}`,
`hue={palette.mint}` — horizonte de 30 dias de cobertura), `:660` (dias até um lote
vencer), `:719` e `:726` (perdas de agora contra as de antes, com
`hue={color.warning}` e `hue={color.inkFaint}`).

---

### 17.13 `FactoryScene`

**Arquivo:** `src/components/FactoryScene.tsx` (236 linhas). **Estado:** implementado e
chamado — só por `src/home/Mosaic.tsx`, e só quando a cara é o **Papel**.

#### Para que serve

A fábrica desenhada em traço, viva porque a fábrica está viva. A frase do dono está no
docblock: *"isso é lindo e preenche os olhos; claro que não é para tirar a atenção"*, e
a regra que ela produziu: **nada aqui se move por decoração** (`FactoryScene.tsx:21-24`).

Quatro coisas se movem, e três delas são dado (`FactoryScene.tsx:26-37`):

| Elemento | O que diz |
|---|---|
| fumaça | sobe quando há tacho aberto; fábrica parada, chaminé parada |
| pote do meio | enche na proporção do dia contra ontem |
| caixa | entra pela direita quando saiu carga hoje; some quando não saiu nada — *"a ausência é dado"* |
| sol | gira devagar — **único decorativo**, *"um sol parado num desenho de céu lê como imagem quebrada"* |

*"Os ciclos são longos de propósito (seis a quarenta e oito segundos): é movimento que
se percebe se você olhar e não se percebe se você estiver trabalhando"*
(`FactoryScene.tsx:39-41`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `running` | `boolean` | — | há tacho aberto agora |
| `dayShare` | `number \| null` | — | o dia contra ontem, de 0 a 1; nulo quando não há com o que comparar |
| `shipped` | `boolean` | — | saiu carga hoje |
| `height` | `number` | `132` | altura da caixa |

#### O que está desenhado

`Svg viewBox="0 0 364 150"`, largura e altura 100%, `accessibilityRole="image"`. Um
grupo comum com `fill="none"`, `stroke={color.ink}`, `strokeWidth={1.3}`, pontas e
junções arredondadas (`FactoryScene.tsx:109-110`).

| Peça | Caminho SVG | Fonte |
|---|---|---|
| linha do chão | `M0 133h364`, com `stroke={color.line}` | `:111` |
| telhado dente-de-serra | `M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16` | `:112` |
| corpo do galpão | `M20 88h64v45H20z` | `:113` |
| quatro janelas | `M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z` | `:114` |
| porta | `M56 133v-23h12v23` | `:115` |
| chaminé | `M92 133V58h14v75M90 62h18` | `:117` |
| câmara fria (caixa) | `M124 76h54v57h-54z` | `:119` |
| divisão e maçanetas | `M124 96h54M168 84v8M168 102v12` | `:120` |
| floco de neve, `stroke={palette.sky}` | `M151 105v18M143 109.5l16 9M143 118.5l16-9` | `:124-125` |
| prateleira, `opacity={0.5}` | `M188 133h75` | `:139` |
| pote 1 | `Rect x=194 y=86 w=15 h=47 rx=2.5` + tampa `M192.5 92h18` | `:140-141` |
| pote 2 (medidor), `stroke={palette.apricot}` | `Rect x=218 y=86 w=15 h=47 rx=2.5` + tampa `M216.5 92h18` | `:142-143` |
| pote 3 | `Rect x=242 y=86 w=15 h=47 rx=2.5` + tampa `M240.5 92h18` | `:145-146` |

#### A troca do picolé pelos potes — a decisão visual

Está escrita inteira em `FactoryScene.tsx:128-138`:

> *"Três potes na prateleira — e eles eram três PICOLÉS. A primeira linha deste projeto
> diz 'nada de regra chumbada de sorvete', e o sorvete estava no maior desenho da capa,
> numa fábrica que pode ser de queijo, tinta ou cosmético. O ícone da aba saiu primeiro;
> este ficou, porque a cena parecia intocável. O que ele NÃO podia perder é a função: o
> pote do meio é medidor — enche na proporção do dia contra ontem —, então o desenho novo
> tinha de continuar sendo recipiente que enche. Tampa em cima, corpo embaixo, e o palito
> virou a linha da prateleira em que os três pousam: a mesma linha de base que a fábrica e
> a câmara usam, que é o que já segurava a composição de pé."*

O docblock também registra o que **saiu** da cena em 3 de setembro
(`FactoryScene.tsx:43-56`): a cena tinha oito grupos em trezentos pixels — fábrica,
chaminé, câmara, três picolés, morango, nuvem e sol. Duas coisas quebravam a composição:

- **o floco flutuava ACIMA da câmara**, e *"lia como um asterisco azul no céu — um
  símbolo sem dono. Ele entrou para dentro do retângulo, que é o que ele existe para
  nomear"*;
- **o morango e a nuvem não pousavam em nada.** *"Objeto solto no ar, sem linha de base e
  sem função, é o que transforma desenho em figurinha espalhada."*

Sobraram quatro grupos e o sol, todos na mesma linha de base.

#### Animações

```
running  → fumaca = withRepeat(withTiming(1, {duration: 6000,  Easing.linear}), -1, false)
!running → fumaca = 0
           giro   = withRepeat(withTiming(1, {duration: 30000, Easing.linear}), -1, false)
           enche  = withTiming(dayShare ?? 0, {duration: 2600, Easing.out(Easing.cubic)})
           caixa  = withSequence(withTiming(shipped ? 1 : 0, {duration: 900, Easing.out(Easing.cubic)}))
```

(`FactoryScene.tsx:89-98`.) Com reduce-motion: `enche = dayShare ?? 0` e
`caixa = shipped ? 1 : 0`, e o comentário *"Parado, mas completo: quem desligou
movimento vê a mesma cena, com o picolé no nível certo e a caixa no lugar"*
(`FactoryScene.tsx:83-85` — o comentário ainda diz "picolé", resíduo da versão
anterior).

`caixa` é inicializado com `shipped ? 1 : 0` já na criação do shared value
(`FactoryScene.tsx:76`).

#### As três camadas fora do SVG

Fumaça, caixa e sol moram **fora** do `<Svg>`, em `Animated.View` posicionadas por
porcentagem. O motivo está escrito (`FactoryScene.tsx:151-158`): *"Dentro dele,
`transform` animado em `<Path>` não atravessa igual nas três plataformas que este app
abre - iOS, Android e o navegador do preview. Uma View posicionada por cima anima do
mesmo jeito nos três... O preço é ter que repetir a posição em porcentagem; o ganho é a
cena se mexer igual em todo lugar."* E para o sol: *"rotação em volta de um ponto é mais
barata numa View do que num nó de SVG, e num celular de fábrica isso conta"*
(`FactoryScene.tsx:162-163`).

| Sub-componente | Posição | Animação | Desenho |
|---|---|---|---|
| `Smoke` | `left: '24%'`, `top: '12%'`, 30×40 | `opacity: progress === 0 ? 0 : Math.sin(progress * Math.PI) * 0.9`; `translateY: 6 - progress * 22` | `M15 38c-7-5 5-11-2-17c-5-5 3-9 0-13`, `stroke={color.inkFaint}`, largura 1,3 |
| `Fill` | dentro do SVG | `y: 133 - 39 * progress`, `height: 39 * progress` | `AnimatedRect x=218 width=15`, `fill={palette.apricot}`, `fillOpacity={0.22}`, `stroke="none"` |
| `Box` | `left: '85%'`, `top: '64%'`, 50×36 | `opacity: progress`; `translateX: (1 - progress) * 46` | `M2 8h44v26H2zM2 17h44M24 8v26M8 8l6-7h26l6 7`, `stroke={color.ink}` |
| sol | `right: '5%'`, `top: '4%'`, 62×62 | `rotate: ${giro * 360}deg` | `Circle cx=31 cy=31 r=11` + oito raios `M31 12v6M31 44v6M12 31h6M44 31h6M18 18l4 4M40 40l4 4M44 18l-4 4M22 40l-4 4`, `stroke={palette.apricot}`, largura 1,3 |

O comentário do `Fill` explica por que as medidas estão coladas às do pote do meio:
*"As medidas seguem o pote do meio; separadas, o preenchimento sai do lugar no dia em que
alguém mexer no desenho — e ninguém percebe, porque a cena continua bonita com a barra
fora do molde. Enche até embaixo da TAMPA, não até a borda: pote cheio até a tampa é pote
transbordando"* (`FactoryScene.tsx:203-206`).

O contêiner leva `pointerEvents="none"` (`FactoryScene.tsx:108`).

#### Onde é usado

`src/home/Mosaic.tsx:108`, dentro do ramo `skin === 'papel'` da peça `producao`, com
`dayShare` calculado como
`data.madeYesterday > 0 ? Math.min(1, data.madeToday / data.madeYesterday) : (data.madeToday > 0 ? 1 : null)`
(`src/home/Mosaic.tsx:112-118`). E `src/home/Mosaic.tsx:893`, no cartão de primeiro dia,
com `running={false} shipped={false} dayShare={null}`.

---

### 17.14 `Field`

**Arquivo:** `src/components/Field.tsx` (88 linhas). **Estado:** implementado e chamado.

#### Para que serve

Um campo com rótulo. *"`hint` is where the intelligence shows up: the field explains what
the system already worked out from what was typed ('R$ 4,72 per kilo becomes 0.472 cents
per gram'), so the person confirms an answer instead of computing one"*
(`Field.tsx:7-10`). E: *"The label is always visible - never a placeholder that vanishes
the moment someone starts typing and leaves them guessing what the box was for"*
(`Field.tsx:11-12`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `label` | `string` | — | vai em CAIXA ALTA no `type.overline`, e vira `accessibilityLabel` do input |
| `value` | `string` | — | controlado |
| `onChangeText` | `(next: string) => void` | — | — |
| `placeholder` | `string` | — | cor `color.inkFaint` |
| `hint` | `string` | — | a conta que o sistema já fez |
| `suffix` | `string` | — | unidade à direita, `type.secondary`, `color.inkFaint` |
| `keyboardType` | `KeyboardTypeOptions` | `'default'` | — |
| `autoFocus` | `boolean` | `false` | — |

#### Desenho

Coluna com `gap: space.xs`. A caixa: `backgroundColor: color.surface`,
`borderColor: color.line`, `borderRadius: radius.md`, `paddingHorizontal: space.md`,
`gap: space.sm`, `borderWidth: StyleSheet.hairlineWidth`, `minHeight: 52`, linha com
`alignItems: 'center'` (`Field.tsx:39-49, 80-86`). O input tem `flex: 1` e
`paddingVertical: 12`, `selectionColor={accent}`, e
`fontVariant: keyboardType === 'default' ? [] : ['tabular-nums']` — ou seja, **só
número ganha figura tabular** (`Field.tsx:63`). O `hint` é `type.caption`,
`color.inkMuted`, com `accessibilityLiveRegion="polite"` (`Field.tsx:71-75`).

#### Onde é usado

`app/assistant.tsx`, `app/catalog.tsx`, `app/inputs/[id].tsx`, `app/inputs/new.tsx`,
`app/orders/new.tsx`, `app/places.tsx`, `app/production/new.tsx`,
`app/products/new.tsx`, `app/purchase.tsx`, `app/recipes/[id].tsx`,
`app/settings.tsx`, `app/transfer.tsx`, `app/weather.tsx`.

---

### 17.15 `Glyph`

**Arquivo:** `src/components/Glyph.tsx` (448 linhas). **26 funções exportadas.**
**Estado:** 25 chamados por tela; `GlyphStick` **sem chamador**.

#### Por que existem duas famílias de desenho

Está escrito no topo (`Glyph.tsx:5-19`): os ícones de `icons.tsx` são traço de 1,6 px
numa grade de 24, feitos para barra de abas e linha de lista. *"No momento em que viraram
o crachá de um cartão, o dono disse o que eles fazem: 'faltam ícones' — porque um traço
fino dentro de um círculo pastel some, e o cartão volta a ser um retângulo com texto."*

A resposta são **duas camadas**: *"Uma massa preenchida em opacidade baixa, que é o que
dá corpo ao símbolo de longe, e o traço por cima, mais grosso, que é o que dá o nome dele
de perto. A cor entra nas duas, então um único parâmetro continua carregando a área."*

E a fronteira: *"Não substituem os antigos e não devem: a barra de abas com estes ícones
vira uma fileira de manchas"* (`Glyph.tsx:17-18`).

O docblock registra o crescimento: *"**A família cresceu de seis para vinte em 3 de
setembro**, e o motivo é uma frase do dono: as vinte telas que não são a capa não tinham
desenho nenhum, 'sem ícone, sem faixa de cor, sem cena', e navegar da capa para elas
parecia dois aplicativos"* (`Glyph.tsx:20-25`). **Hoje o arquivo tem 26** — o docblock
está desatualizado quanto ao número.

E o processo de aprovação: *"Cada um foi olhado impresso lado a lado, nos dois pesos e em
26 e 64 pixels, antes de entrar. Dois voltaram para a prancheta na primeira olhada: a
embalagem tinha virado ampulheta e o palito perdia a haste do meio"* (`Glyph.tsx:27-29`).

#### `GlyphProps` e as três funções auxiliares

```ts
type GlyphProps = {
  size?: number;   // padrão 26
  color: string;   // obrigatório
  weight?: number; // padrão 2.2
};

function frame(size) { return { width: size, height: size, viewBox: '0 0 32 32' }; }

const line = (color, width = 2.2) => ({
  stroke: color, strokeWidth: width,
  strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
});

const mass = (color, opacity = 0.24) => ({ fill: color, opacity });

const massIf = (weight, color, opacity = 0.24) =>
  weight >= 2 ? mass(color, opacity) : { fill: 'none' };
```

(`Glyph.tsx:32-72`.)

**A grade é 32×32**, não 24 como a de `icons.tsx`.

`weight` é da **identidade**, não do ícone (`Glyph.tsx:35-45`): *"O dono escolheu **fino**
para o Papel, olhando as três espessuras lado a lado: a ilustração do topo é desenhada com
1,3, e um ícone gordo ao lado dela se separa da cena em vez de conversar com ela."* As
telas passam `1.7` no Papel e `2.2` no Orgânico.

`massIf` existe porque **a massa some quando o traço é fino** (`Glyph.tsx:63-70`): *"No
traço fino do Papel elas brigam: a mancha pastel sob a linha delicada vira borrão, e foi
exatamente o que o dono recusou quando o ícone virou selo cheio. Abaixo de 2, o glifo é só
linha."*

Vários glifos usam `weight - 0.4` nos detalhes internos (vincos, linhas de texto,
furos), para o detalhe não competir com a silhueta.

#### O catálogo completo

| Função | O que está desenhado | Caminhos/formas | Chamadores |
|---|---|---|---|
| `GlyphProduction` (`:101`) | a unidade saindo pela esteira | `Rect x7 y5 w13 h12 rx3` (massa+traço) · `M5.5 22h17` (esteira) · `M22 18.5l3.5 3.5-3.5 3.5` (seta) | `app/production/new.tsx`, `app/products/new.tsx`, `app/products/index.tsx`, `app/(tabs)/production.tsx`, `src/home/Mosaic.tsx` |
| `GlyphStock` (`:113`) | o saco de insumo que enche e esvazia | `M8 12h16l-1.6 15H9.6z` · alça `M11.5 12V8a4.5 4.5 0 0 1 9 0v4` | `app/inputs/index.tsx`, `app/(tabs)/reports.tsx`, `src/home/Mosaic.tsx` |
| `GlyphBox` (`:124`) | a caixa que vai para a loja | `M16 4l11 6v12l-11 6-11-6V10z` · arestas `M5 10l11 6 11-6M16 16v12` em `weight - 0.4` | `app/transfer.tsx`, `app/products/new.tsx`, `app/(tabs)/transport.tsx`, `src/home/Mosaic.tsx` |
| `GlyphPrice` (`:135`) | a etiqueta de preço | `M4 16.5V6a2 2 0 0 1 2-2h10.5L28 15.5 17 27z` · furo `Circle cx10 cy10 r2.2` | `app/recipes/[id].tsx`, `app/products/new.tsx`, `app/inputs/[id].tsx`, `app/catalog.tsx`, `app/(tabs)/reports.tsx`, `app/purchase.tsx`, `src/home/Mosaic.tsx` |
| `GlyphOrder` (`:146`) | a prancheta do que os clientes combinaram | `Rect x6 y5 w20 h24 rx4` · presilha `Rect x12 y2 w8 h6 rx2` · linhas `M11 16h10M11 22h6` | `app/orders/new.tsx`, `app/orders/index.tsx`, `app/settings.tsx`, `src/home/Mosaic.tsx` |
| `GlyphKettle` (`:158`) | o tacho no fogo | `M5 13h22v7a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z` · vapor `M12 8.5c0-2 2-2 2-4M18 8.5c0-2 2-2 2-4` | `app/lots/[id].tsx`, `app/production/new.tsx`, `app/(tabs)/production.tsx` |
| `GlyphStore` (`:169`) | a fachada com toldo de bico | toldo `M8 6h16l4 6a4 3 0 0 1-8 0a4 3 0 0 1-8 0a4 3 0 0 1-8 0z` · corpo `Rect x6 y15 w20 h13 rx1` · porta `M13 28v-6a3 3 0 0 1 6 0v6` | `app/places.tsx`, `app/transfer.tsx`, `app/(tabs)/transport.tsx` |
| `GlyphFactory` (`:188`) | galpão dente-de-serra com chaminé na ponta | `M4 28V5h4v10l6 6v-6l6 6v-6l6 6v7z` | `app/places.tsx`, `app/weather.tsx` |
| `GlyphVehicle` (`:198`) | caminhão de perfil | `M3 21V7h15v5h6l3 4v5z` · rodas `Circle cx8.5 cy23 r2.6` e `cx22 cy23 r2.6` | `app/places.tsx`, `app/transfer.tsx`, `app/(tabs)/transport.tsx` |
| `GlyphCustomer` (`:210`) | pessoa **sem rosto** com sacola ao lado | cabeça `Circle cx10 cy8 r4` · tronco `M3.5 27v-6a6.5 6.5 0 0 1 13 0v6z` · sacola `Rect x20 y18 w8 h9 rx1` · alça `M21.5 18v-1a2.5 2.5 0 0 1 5 0v1` | `app/places.tsx`, `app/orders/new.tsx` |
| `GlyphSack` (`:225`) | saco de pano com pescoço estrangulado | barriga (massa e traço, o mesmo `d`) `M13 12.5 C8.6 15.2 6.5 19.6 6.5 23.5 C6.5 26.3 8.2 28 11 28 H21 C23.8 28 25.5 26.3 25.5 23.5 C25.5 19.6 23.4 15.2 19 12.5 Z` · pano recolhido `M13 12.5 L10.6 6.8 C12.4 7.8 14.2 8 16 7.4 C17.8 8 19.6 7.8 21.4 6.8 L19 12.5 Z` · barbante `M10.4 12.5 H21.6` | `app/recipes/[id].tsx`, `app/production/new.tsx`, `app/inputs/[id].tsx`, `app/inputs/new.tsx`, `app/inputs/index.tsx`, `app/purchase.tsx` |
| `GlyphBucket` (`:243`) | balde com aba mais larga que o corpo | corpo `M7.8 14.2 H24.2 L22.4 26.4 C22.2 27.5 21.3 28 20.2 28 H11.8 C10.7 28 9.8 27.5 9.6 26.4 Z` (massa e traço, o mesmo `d`) · aba `Rect x5.6 y9.8 w20.8 h4.4 rx2.2` · alça em arco `M7.8 9.8 C8.2 5.4 11.4 3.6 16 3.6 C20.6 3.6 23.8 5.4 24.2 9.8` | `app/inputs/index.tsx` |
| `GlyphPackaging` (`:261`) | saquinho de filme com duas soldas serrilhadas | corpo `M8.5 8.5 H23.5 V23.5 H8.5 Z` · solda de cima `M8.5 8.5 L11 5 L13.5 8.5 L16 5 L18.5 8.5 L21 5 L23.5 8.5` · solda de baixo espelhada · vinco `M16 10.5 v11` | `app/products/new.tsx`, `app/inputs/index.tsx` |
| `GlyphStick` (`:277`) | três hastes de ponta arredondada, abertas em leque | três hastes, cada uma desenhada em massa e depois em traço — `esquerda` `M5.2 7.6 a2.3 2.3 0 0 1 4.4 -1.2 L14 24 a2.3 2.3 0 0 1 -4.4 1.2 Z` · `meio` `M13.8 6.3 a2.3 2.3 0 0 1 4.4 0 L18.2 25.1 a2.3 2.3 0 0 1 -4.4 0 Z` · `direita` `M22.4 6.4 a2.3 2.3 0 0 1 4.4 1.2 L22.4 25.2 a2.3 2.3 0 0 1 -4.4 -1.2 Z` | **SEM CHAMADOR** |
| `GlyphRecipe` (`:294`) | folha com a lista do que entra | folha `M7 3.5 h13.5 L25 8 v20.5 H7 Z` · dobra `M20.5 3.5 V8 H25` · linhas `M11 14h10M11 19h10M11 24h6` | `app/recipes/[id].tsx`, `app/recipes/index.tsx`, `app/inputs/[id].tsx` |
| `GlyphPurchase` (`:307`) | recibo de borda picotada embaixo | `M6.5 3.5 h19 V26 l-3.2 -2.2 -3.2 2.2 -3.1 -2.2 -3.2 2.2 -3.1 -2.2 L6.5 26 Z` · linhas `M10.5 10h11M10.5 15h7` | `app/inputs/[id].tsx`, `app/(tabs)/more.tsx`, `app/purchase.tsx` |
| `GlyphLabel` (`:320`) | tag furada com o quadrado de leitura | tag `M4.5 13.5 L14.5 3.5 H27 v12.5 L17 26 Z` · furo `Circle cx22.4 cy8.6 r1.9` · risco `M10.5 14.5 l4.5 4.5` | `app/lots/[id].tsx`, `app/(tabs)/production.tsx` |
| `GlyphCalendar` (`:333`) | folhinha com o dia marcado | `M4.5 7.5 h23 v20 h-23 Z` · cabeçalho `M4.5 13.5 h23` · argolas `M10 3.5 v6M22 3.5 v6` · dia `Circle cx16 cy20.5 r2.6` | `app/orders/new.tsx`, `app/settings.tsx` |
| `GlyphLoss` (`:347`) | a gota que escorreu | `M16 4.5 C21.5 12 24.5 16 24.5 20 A8.5 8.5 0 0 1 7.5 20 C7.5 16 10.5 12 16 4.5 Z` · brilho `M12.6 19.5 a3.4 3.4 0 0 0 3.4 3.4` | `app/settings.tsx`, `app/losses.tsx`, `app/inputs/[id].tsx`, `app/(tabs)/reports.tsx` |
| `GlyphCount` (`:359`) | prancheta com dois tiques e duas linhas | `M6 5.5 h20 v23 H6 Z` · tiques `M9.5 11.5 l2.2 2.2 4-4.4` e `M9.5 19 l2.2 2.2 4-4.4` · linhas `M18.5 12h4M18.5 19.5h4` | `app/settings.tsx`, `app/inputs/[id].tsx` |
| `GlyphChart` (`:373`) | três barras que comparam | base `M5.5 27.5 h21` · barras `M8.5 22 h4 v5.5 h-4 Z`, `M14.5 13 h4 v14.5 h-4 Z`, `M20.5 18 h4 v9.5 h-4 Z` | `app/losses.tsx`, `app/inputs/[id].tsx` |
| `GlyphThermometer` (`:388`) | termômetro de bulbo | haste `M13 18.5 V7 a3 3 0 0 1 6 0 v11.5 a5.5 5.5 0 1 1 -6 0 Z` · bulbo `Circle cx16 cy23 r2.2` · marcas `M21.5 10h3M21.5 14h3` | `app/places.tsx`, `app/settings.tsx`, `app/weather.tsx` |
| `GlyphSettings` (`:401`) | dois controles deslizantes | trilhos `M5 10h22M5 22h22` · botões `Circle cx12 cy10 r3.4` e `Circle cx21 cy22 r3.4` | `app/settings.tsx`, `app/(tabs)/more.tsx` |
| `GlyphAssistant` (`:414`) | balão de fala com duas linhas | `M5 8.5 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 H14 l-6 5.5 V21.5 h-0 a3 3 0 0 1 -3 -3 Z` · linhas `M10.5 11h11M10.5 16h7` | `app/assistant.tsx`, `app/(tabs)/more.tsx` |
| `GlyphCatalog` (`:426`) | grade de quatro produtos — **dois com massa, dois só de traço** | `M5 5 h9.5 v9.5 H5 Z` (massa), `M17.5 5 h9.5 v9.5 h-9.5 Z` (traço), `M5 17.5 h9.5 V27 H5 Z` (traço), `M17.5 17.5 h9.5 V27 h-9.5 Z` (massa) | `app/settings.tsx`, `app/products/new.tsx`, `app/products/index.tsx`, `app/catalog.tsx`, `app/(tabs)/more.tsx` |
| `GlyphPlus` (`:440`) | mais dentro de um círculo, no peso da família | `Circle cx16 cy16 r11.5` · `M16 10.5 v11M10.5 16 h11` | `app/orders/new.tsx`, `app/orders/index.tsx`, `app/products/new.tsx`, `app/inputs/new.tsx`, `app/inputs/index.tsx`, `app/(tabs)/production.tsx` |

#### `GlyphProduction`: a troca do picolé, e as três reprovações

Este é o bloco mais longo do arquivo (`Glyph.tsx:74-99`), e vale transcrever a
argumentação inteira porque ela é o registro da decisão:

> *"**Era um picolé**, e isso contradizia a primeira linha do projeto: 'nasce numa fábrica
> de picolés, mas será publicado nas lojas — nada de regra chumbada de sorvete'. O sorvete
> não estava numa regra, estava no lugar mais visível que existe: a aba de baixo e o crachá
> do primeiro cartão da capa. Quem instala para fabricar queijo, tinta ou cosmético abre o
> aplicativo e vê o produto de outra pessoa."*
>
> *"A unidade saindo pela esteira serve qualquer fábrica, e o desenho passou por três
> versões antes desta — cada uma reprovada por uma FOTO da barra de abas, que é o único
> lugar onde um ícone é julgado ao lado dos irmãos dele:*
>
> - *__três unidades empilhadas__ viraram irmãs do ícone de "Mais" (dois amontoados de
>   quadradinhos na mesma barra), o que é pior que o picolé: confunde navegação em vez de só
>   falar do produto errado;*
> - *__unidade sobre esteira com três roletes__ virou irmã do caminhão — caixa com rodas, do
>   lado de uma caixa com rodas.*
>
> *A seta resolve as duas: caminhão tem roda, isto tem SAÍDA."*
>
> *"Esta silhueta não colide com nada do vocabulário: o saco e o balde são insumo, a caixa é
> transporte, o tacho é o processo aberto, a etiqueta é o lote, a grade é 'Mais'. Esta é a
> SAÍDA — a única coisa que toda fábrica deste produto tem em comum, seja picolé, queijo,
> tinta ou cosmético."*

Note que a mesma troca aconteceu em **dois lugares**: aqui e na `FactoryScene`
(§17.13). O ícone da aba (`IconProduction`, §17.16) tem hoje a mesma silhueta de
esteira com seta.

#### Outras decisões de vocabulário registradas linha a linha

- **`GlyphCustomer` não tem rosto** *"porque é qualquer um"* (`Glyph.tsx:209`).
- **`GlyphSack` contra `GlyphPackaging`:** o saco é *"pano recolhido acima do barbante,
  pescoço estrangulado e barriga cheia apoiada no chão — a unidade que chega no caminhão e
  se pesa, não o almoxarifado inteiro"* (`Glyph.tsx:224`); a embalagem é *"o saquinho de
  filme com as duas soldas serrilhadas — corpo liso no meio, e nada a ver com o saco de
  insumo, que é pano amarrado"* (`Glyph.tsx:260`).
- **`GlyphStore` contra `GlyphFactory`:** loja é *"o que se reconhece da calçada, pela
  frente"*; fábrica é *"o prédio que produz, não o que vende"* (`Glyph.tsx:168,187`).
- **`GlyphSettings` não é engrenagem:** *"os controles deslizantes — o que se regula, e não
  a engrenagem, que é vocabulário de programador"* (`Glyph.tsx:400`).
- **`GlyphLoss`:** *"o que derreteu, vazou ou venceu, **e não é culpa de ninguém na
  tela**"* (`Glyph.tsx:346`) — a mesma regra de tom de voz aplicada ao desenho.
- **`GlyphCount`:** *"alguém andou até a prateleira e conferiu o que estava lá"*
  (`Glyph.tsx:358`).
- **`GlyphThermometer`:** *"a grandeza que a câmara fria responde, com sensor ou sem"*
  (`Glyph.tsx:387`).
- **`GlyphChart`:** *"o desenho de 'isto aqui é normal?'"* (`Glyph.tsx:372`).

#### Estado de `GlyphStick`

`GlyphStick` (`Glyph.tsx:276-291`) está descrito como *"material que entra na conta por
milheiro e não se come"*. **Nenhum arquivo do repositório o importa** (verificado em
`app/`, `src/`, `e2e/`, `scripts/`). É a única peça desta família sem chamador, e ela
cai no P1 do portão descrito no `CLAUDE.md` (*"Quem chama isto no mesmo commit? Sem
chamador, não entra"*).

---

### 17.16 `icons`

**Arquivo:** `src/components/icons.tsx` (147 linhas). **9 funções exportadas.**
**Estado:** 6 chamados; `IconStock`, `IconCost` e `IconLoss` **sem chamador**.

#### Para que serve

*"The icons the design draws, and nothing else. Every shape here was traced from the
artboards in the design canvas, not picked from a library: the tab bar, the report rows
and the 'Mais' grid use the same drawing at different sizes, which is what makes the app
feel like one hand drew it"* (`icons.tsx:4-9`).

Duas regras que o arquivo obedece (`icons.tsx:11-15`): *"The colour lives ONLY in the
stroke - no filled surfaces, ever - so an icon is a line drawing that carries its area's
colour and nothing more. And the stroke is 1.6px at 24px, scaled with the size, so the
weight reads the same at 26px in the bar and at 30px in a list."*

#### Tipo e auxiliares

```ts
type IconProps = {
  size?: number;  // padrão 24
  color: string;  // obrigatório — nunca preenchimento, é o traço
};

const GRID = 24;

function frame(size) {
  return { width: size, height: size, viewBox: `0 0 ${GRID} ${GRID}`, fill: 'none' };
}

const stroke = (color) => ({
  stroke: color, strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round',
});
```

(`icons.tsx:18-50`.)

A espessura é **constante em unidades de grade**, e isso é escrito: *"A constant, and
that is the point: the viewBox does the scaling, so 1.6 units on a 24-unit grid keeps
the same apparent weight whether the icon is drawn at 26px in the tab bar or at 30px in
a list. Scaling it by hand would make the line thicker as the icon grows, which is what
makes an icon set look borrowed from three places"* (`icons.tsx:37-43`).

#### O catálogo

| Função | O que está desenhado | Formas | Chamadores |
|---|---|---|---|
| `IconHome` (`:53`) | uma casa — *"because the briefing is where you come back to"* | `M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z` | `app/(tabs)/_layout.tsx` (área `sky`) |
| `IconProduction` (`:62`) | *"a unidade saindo pela esteira: o que a fábrica pôs para fora"* | `Rect x5 y3.5 w10 h9 rx2.2` · `M4 16.5h13.5` · `M17 13.8l2.7 2.7-2.7 2.7` | `app/(tabs)/_layout.tsx` (área `apricot`), `app/production/new.tsx` |
| `IconTransport` (`:73`) | um caminhão | `M2 7.5h11v9H2z` · `M13 11h4l3.5 3.5v2H13z` · rodas `Circle cx6.5 cy18.5 r1.9` e `cx16.5 cy18.5 r1.9` | `app/(tabs)/_layout.tsx` (área `lilac`) |
| `IconReports` (`:85`) | barras numa linha de base | `M4 20h16` · `M6.5 20v-6` · `M12 20V5` · `M17.5 20v-9` | `app/(tabs)/_layout.tsx` (área `sand`) |
| `IconMore` (`:97`) | grade 2×2 — *"the drawers"* | quatro `Rect` 7×7 `rx2` em (3.5,3.5), (13.5,3.5), (3.5,13.5), (13.5,13.5) | `app/(tabs)/_layout.tsx` (área `mist`) |
| `IconStock` (`:109`) | um cubo | `M12 3l8 4.5v9L12 21l-8-4.5v-9z` · `M4 7.5l8 4.5 8-4.5` · `M12 12v9` | **SEM CHAMADOR** |
| `IconCost` (`:120`) | cifrão | `M12 3v18` · `M16 7.5a3.5 3.5 0 0 0-3.5-2.5h-1a3.5 3.5 0 0 0 0 7h1a3.5 3.5 0 0 1 0 7h-1A3.5 3.5 0 0 1 8 16.5` | **SEM CHAMADOR** |
| `IconChevron` (`:130`) | seta de abrir | `M9.5 5l7 7-7 7` | `app/(tabs)/more.tsx`, `app/(tabs)/production.tsx`, `app/(tabs)/reports.tsx`, `app/(tabs)/transport.tsx`, `app/products/index.tsx`, `app/recipes/index.tsx`, `app/settings.tsx` |
| `IconLoss` (`:139`) | triângulo com exclamação | `M12 3.5l9 16H3z` · `M12 9.5v5` · `M12 17.2v.1` | **SEM CHAMADOR** |

#### Comentários desatualizados

`IconStock` traz o docblock *"A cube: what is held somewhere. Used by the Estoque report
row"* (`icons.tsx:108`) — mas `app/(tabs)/reports.tsx:5` importa `GlyphStock`, não
`IconStock`. O mesmo vale para o docblock do arquivo, que diz que *"the report rows and
the 'Mais' grid"* usam esta família: hoje as duas usam `Glyph`.

#### Como a barra de abas os usa

`app/(tabs)/_layout.tsx:84-93` embrulha cada ícone numa função nomeada
(*"an anonymous arrow here is a component the React tooling cannot label - and a tab bar
that crashes reports five identical frames"*), com `size={24}` dentro de uma `View` de
`height: 26`. A cor vem de `palette[area]`, e **não muda com o foco**: o único sinal de
seleção é a cor do rótulo indo de `color.inkFaint` para `color.ink`
(`app/(tabs)/_layout.tsx:68`), porque *"the bar reads as five lit doors rather than one
shouting"* (`app/(tabs)/_layout.tsx:23-27`).

---

### 17.17 `Landscape`

**Arquivo:** `src/components/Landscape.tsx` (194 linhas). **Estado:** implementado e
chamado — só por `src/home/Mosaic.tsx`, e só quando a cara é o **Orgânico**.

#### Para que serve

*"A paisagem do Orgânico — e ela é a previsão, não um desenho bonito. Irmã da
`FactoryScene` do Papel: cada identidade tem o seu cabeçalho vivo, e as duas obedecem a
mesma regra — **nada se move por decoração**"* (`Landscape.tsx:16-19`).

O que cada peça responde (`Landscape.tsx:21-32`):

| Elemento | O que diz |
|---|---|
| céu | a paleta que a empresa escolheu nos ajustes — *"Quem trocou o verde por âmbar não quer um céu verde"* |
| nuvem e chuva | só existem quando a chance passa de 30% — *"Abaixo disso é ruído, e ruído todo dia ensina a não olhar"* |
| fumaça | sobe quando há tacho aberto |
| sol | gira devagar; **único decorativo** |

E o estado sem previsão: *"Sem previsão — sem rede e sem cache — a paisagem existe **sem
tempo**: colina, fábrica e sol, e nenhuma nuvem. É a mesma decisão do cartão do clima, que
some em vez de mostrar um '--°' que ninguém pode conferir"* (`Landscape.tsx:30-32`).

#### `noturno(hex, fator)`

```ts
function noturno(hex: string, fator: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * fator);
  const g = Math.round(((n >> 8) & 255) * fator);
  const b = Math.round((n & 255) * fator);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
```

(`Landscape.tsx:46-52`.) Escurece uma cor multiplicando os três canais.

O motivo é uma cicatriz registrada (`Landscape.tsx:34-45`): *"No escuro a paisagem
pintava `sunken` sobre `surface` sobre `paper`: três cinzas separados por dezoito
unidades de brilho. O desenho existia e não se via — o dono abriu o aplicativo e mandou a
foto de uma caixa preta com um sol dentro, que é exatamente o que estava lá."* E a regra
que sai disso: *"A regra do tema ('escuro é cinza neutro, cor só de acento') vale para
SUPERFÍCIE, não para cena: uma colina não é fundo de cartão, é a figura."*

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `maxC` | `number \| null` | — | a máxima de hoje; nulo quando não há previsão nem cache |
| `rainChance` | `number \| null` | — | chance de chuva em por cento |
| `running` | `boolean` | — | há tacho aberto agora |
| `height` | `number` | `210` | altura da caixa |

#### Estado derivado

- `const paleta = hues[hue]` — `hue` vem de `useAppearance()` (`Landscape.tsx:69-70`).
  As cinco paletas (`src/theme/tokens.ts:378-384`):

| `Hue` | `brand` | `skyTop` | `skyBottom` | `hillFar` | `hillNear` |
|---|---|---|---|---|---|
| `verde` | `#2F7D5C` | `#DFF0E6` | `#BFE3CF` | `#A9DCC0` | `#7CC9A6` |
| `azul` | `#2E6DA4` | `#DCEAFC` | `#BCD8F7` | `#A9C8E8` | `#7BA9D6` |
| `ambar` | `#C2751F` | `#FDEEDA` | `#FBDCB4` | `#F0CF9A` | `#E0B273` |
| `terracota` | `#B4552D` | `#FBE6DF` | `#F6CDC0` | `#EEB9A6` | `#DD9781` |
| `lavanda` | `#6B5FA8` | `#E9E4F8` | `#D4CBF0` | `#C3B9E6` | `#A396D4` |

- `const chovendo = rainChance !== null && rainChance >= 30` (`Landscape.tsx:77`)
- `const noite = scheme === 'dark'` (`Landscape.tsx:78`)
- `const quente = maxC !== null && maxC >= 26` (`Landscape.tsx:111`) — *"O calor muda a
  saturação do céu, não a paleta: quem escolheu âmbar continua no âmbar num dia frio, só
  que mais lavado"* (`Landscape.tsx:109-110`). Na prática: `stopOpacity` do topo do
  degradê é 1 quando quente, 0,85 quando não.

#### Animações

| Valor | Duração | Curva | Condição |
|---|---|---|---|
| `giro` (sol) | 34.000 ms | `Easing.linear`, repete infinito | sempre |
| `deriva` (nuvem) | 9.000 ms | `Easing.inOut(Easing.quad)`, repete **invertendo** (`true`) | sempre |
| `gota` (chuva) | 2.200 ms | `Easing.linear` | só se `chovendo` |
| `fumaca` | 7.000 ms | `Easing.linear` | só se `running` |

(`Landscape.tsx:84-91`.) Estilos derivados (`Landscape.tsx:98-107`):

```
sol:    rotate: `${giro * 360}deg`
nuvem:  translateX: (deriva - 0.5) * 12
chuva:  opacity: Math.sin(gota * Math.PI) * 0.9 ; translateY: gota * 22
fumo:   opacity: fumaca === 0 ? 0 : Math.sin(fumaca * Math.PI) * 0.55
        translateY: -fumaca * 20 ; scale: 0.9 + fumaca * 0.3
```

Com reduce-motion, o efeito retorna cedo e nada disso parte (`Landscape.tsx:83`).

#### O que está desenhado

Contêiner: `height`, `overflow: 'hidden'`, `borderRadius: radius.md`,
`pointerEvents="none"` (`Landscape.tsx:120`). O canto arredondado é uma correção
registrada: *"Ela era um retângulo de canto reto dentro de um cartão de canto
arredondado: um bloco de outro vocabulário colado no meio do Orgânico, que é um tema de
curvas. Aparece na foto como uma quina dura no meio de tudo o que é redondo"*
(`Landscape.tsx:114-119`).

`Svg viewBox="0 0 412 210" preserveAspectRatio="none"`.

| Camada | O que é | Fonte |
|---|---|---|
| céu | `LinearGradient id="ceu"` vertical. Topo: `noite ? color.paper : paleta.skyTop` com `stopOpacity` 1/0,85. Base: `noite ? noturno(paleta.skyBottom, 0.3) : paleta.skyBottom`. Preenche `Rect 412×210` | `:123-128` |
| colina distante | `M0 150c70-22 120 14 206 2s136-30 206-12v70H0z`, `fill` = `noturno(hillFar, 0.42)` de noite | `:130-133` |
| fábrica (corpo) | `M282 156h60v30h-60z` | `:135` |
| fábrica (telhado dente-de-serra) | `M282 156l10-15 10 15 10-15 10 15 10-15 10 15` | `:136` |
| chaminé | `Rect x=348 y=132 w=9 h=54` | `:137` |
| três janelas acesas | `Rect` 8×8 em x=290, 304, 318, y=166; `fill` = `noite ? '#F5C66A' : '#FFFFFF'` | `:139-143` |
| colina próxima | `M0 182c80-16 130 12 206 4s130-22 206-6v34H0z`, `fill` = `noturno(hillNear, 0.58)` de noite | `:144-147` |
| sol | absoluto `right: 30, top: 18`, 78×78. `Circle cx39 cy39 r18` **preenchido** + oito raios `M39 6v8M39 64v8M6 39h8M64 39h8M15 15l6 6M57 57l6 6M63 15l-6 6M21 57l-6 6`, `strokeWidth={4}`. Cor: `noite ? '#F7E6B5' : '#FFD76A'` | `:151-158` |
| nuvem (só chovendo) | absoluto `right: 60, top: 48`, 96×46. `M8 34a14 14 0 0 1 14-13 18 18 0 0 1 34 5 12 12 0 0 1-3 24H22a12 12 0 0 1-14-16z`, `fill` = `noite ? color.sunken : '#FFFFFF'` | `:163-170` |
| chuva (só chovendo) | absoluto `right: 76, top: 92`, 64×22. Três `Circle r=3.4` em (10,6), (32,10), (54,6), `fill="#8EC5FC"` | `:171-179` |
| fumaça | absoluto `right: 44, top: 108`, 22×26. `Circle cx9 cy18 r5` e `cx14 cy10 r4`, `fill` = `noite ? color.inkFaint : '#FFFFFF'` | `:184-191` |

Note a diferença de vocabulário entre as duas cenas: a `FactoryScene` é **só traço**
(`fill="none"`, largura 1,3); a `Landscape` é **só massa** (colinas, sol e nuvem
preenchidos, sem contorno). É a mesma divisão Papel/Orgânico que o `Card` e o `Button`
fazem.

O sol da `Landscape` é preenchido; o da `FactoryScene` é contorno. E a fumaça: aqui são
dois círculos cheios, lá é um traço serpenteante.

#### Onde é usado

`src/home/Mosaic.tsx:120` (ramo `skin !== 'papel'` da peça `producao`, com
`height={150}`) e `src/home/Mosaic.tsx:895` (cartão de primeiro dia).

---

### 17.18 `ListRow`

**Arquivo:** `src/components/ListRow.tsx` (119 linhas). **Estado:** implementado e
chamado.

#### Para que serve

*"`detail` is not decoration and it is not optional in spirit: a list where every row is
just a name makes the person open each one to find out anything, which is the slowest
possible way to use a phone. The row carries the number they came looking for - what the
sugar costs, how many units a batch makes - so most of the time they never have to tap at
all"* (`ListRow.tsx:8-13`).

*"`trailing` is for the one figure that dominates, kept right-aligned and in tabular
figures so a column of them can be compared by eye"* (`ListRow.tsx:14-15`).

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `label` | `string` | — | `type.body`, `color.ink`, `numberOfLines={1}` |
| `detail` | `string` | — | `type.caption`, `color.inkFaint`, `numberOfLines={2}` |
| `trailing` | `string` | — | à direita, tabular, `fontWeight: '600'` |
| `trailingTone` | `'ink' \| 'muted' \| 'ok' \| 'warning'` | `'ink'` | mapeado para `color.ink` / `color.inkMuted` / `color.ok` / `color.warning` |
| `signal` | `'ok' \| 'warning' \| 'danger' \| 'neutral'` | — | o traço vertical da borda |
| `onPress` | `() => void` | — | quando ausente, a linha não afunda e não mostra chevron |

#### Comportamento

- **O traço de sinal é vertical e não texto colorido** (`ListRow.tsx:31-39`): *"cor
  sozinha não é informação para quem não distingue verde de vermelho, então a linha
  continua dizendo o número por extenso e o traço é o atalho para quem passa o olho.
  Ausente é o caso normal — item sem régua cadastrada não ganha cor, porque o aplicativo
  não sabe o que é pouco para ele."* Desenho: `width: 3`, `alignSelf: 'stretch'`,
  `borderRadius: 2`; `neutral` cai em `color.line` (`ListRow.tsx:78-94`).
- **Afunda só quando leva a algum lugar** (`ListRow.tsx:54-58`): *"Linha sem destino que
  afunda promete uma navegação que não existe, e num celular de fábrica, de luva, o
  afundar é também a única confirmação de que o toque pegou."* `onPressIn` só escreve em
  `held` se `onPress` existir (`ListRow.tsx:67-69`).
- Escala: `1 - held.value * (1 - motion.pressScale)` (`ListRow.tsx:61`) — mesma
  aritmética do `Touchable`.
- **Acessibilidade:** `accessibilityRole={onPress ? 'button' : 'text'}` e
  `accessibilityLabel={detail ? \`${label}. ${detail}\` : label}` (`ListRow.tsx:74-75`).
- **Chevron:** um `›` em `type.body`, `color.inkFaint`, só quando há `onPress`
  (`ListRow.tsx:111`).
- Linha: `flexDirection: 'row'`, `alignItems: 'center'`, `paddingVertical: space.md`,
  `gap: space.md` (`ListRow.tsx:76, 117`).
- **Não consulta reduce-motion.**

#### Onde é usado

`app/(tabs)/more.tsx`, `app/(tabs)/reports.tsx`, `app/assistant.tsx`,
`app/inputs/[id].tsx`, `app/inputs/index.tsx`, `app/losses.tsx`, `app/orders/index.tsx`,
`app/orders/new.tsx`, `app/places.tsx`, `app/production/new.tsx`,
`app/products/index.tsx`, `app/purchase.tsx`, `app/recipes/[id].tsx`,
`app/recipes/index.tsx`, `app/settings.tsx`, `app/weather.tsx`.

---

### 17.19 `Mark`

**Arquivo:** `src/components/Mark.tsx` (27 linhas). **Estado:** implementado; **nenhuma
tela o importa** — o único chamador é `CollapsingHeader`.

#### O que está desenhado

*"The mark: a solid disc with a 55-degree notch pointing north"* (`Mark.tsx:6`).

O caminho vem de `src/config/brand.ts:25`:

```
markPath: 'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'
```

numa `viewBox="0 0 100 100"` (`Mark.tsx:23`). É um disco de raio 44 centrado em (50,50),
com um pedaço de 55 graus recortado apontando para cima — o caminho vai do centro até
(70,3; 11), percorre o arco grande até (29,7; 11) e fecha no centro.

#### A leitura por trás da forma

`Mark.tsx:8-15`:

> *"It is the compass __dial__, not the needle - the body that rotates while the reference
> settles. That reading is what makes the motion work with a single piece: a needle
> spinning needs a dial behind it to mean anything, and this shape already is the dial."*
>
> *"One color, never two: with two tones the disc reads as a pie slice. Solid mass with a
> single cut is also what survives 16px and prints on a monochrome thermal label."*

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `size` | `number` | `24` | lado do quadrado |
| `color` | `string` | — | quando ausente, cai na cor da marca por esquema |

`const fill = color ?? (scheme === 'dark' ? brand.markColorDark : brand.markColorLight)`
(`Mark.tsx:19-20`), com `markColorLight = '#2E2B27'` e `markColorDark = '#EDEBE7'`
(`src/config/brand.ts:32-33`). O comentário na fonte da marca explica a escolha de
grafite: *"The interface carries eight ambient colors, one per area; a colored mark would
fight all of them. Graphite sits on any of them, and prints on a monochrome thermal
label — the printer on the factory floor"* (`src/config/brand.ts:28-31`).

Na prática o `CollapsingHeader` **sempre** passa `color={accent}`, então a cor por
esquema nunca é exercitada pelo aplicativo hoje.

#### Onde é usado

`src/components/CollapsingHeader.tsx:76` (Papel, `size={18}`) e `:79` (Orgânico,
`size={15}`, dentro do selo).

---

### 17.20 `PulseDot`

**Arquivo:** `src/components/PulseDot.tsx` (95 linhas). **Estado:** implementado e
chamado.

#### Para que serve

*"The 'this is live' pulse: a slow halo expanding out of a dot"* (`PulseDot.tsx:13`).

Quatro regras, escritas como mais importantes que a animação (`PulseDot.tsx:15-23`):

1. *"it never blinks; the cycle is 2.6s, because blinking is aggressive and users learn
   to tune it out"*
2. *"how many pulse at once is decided by how many things are actually happening, never by
   a quota; what bounds it in practice is the battery of a phone that stays on all shift"*
3. *"it only goes next to a number that is genuinely updating - a pulse beside a frozen
   value is a visual lie, and people notice"*
4. *"reduced-motion turns it off and the dot stays, fully legible"*

#### `live` é obrigatório, e isso é o ponto

O segundo docblock (`PulseDot.tsx:25-37`) guarda a cicatriz inteira:

> *"The third rule above was written here and broken by the first caller: the home screen
> pulsed every product card, including the ones whose cost had not moved in weeks. Nothing
> caught it because the component had no way to say 'not live' - honouring the rule meant
> remembering not to render it at all, and remembering is not a mechanism."*
>
> *"Required, the fact has to be stated at every call site, and a screen that cannot say
> whether its number is moving fails to compile instead of lying quietly to whoever is
> holding the phone."*

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `live` | `boolean` | **sem padrão** | se o número está de fato se movendo |
| `color` | `string` | `accent` | — |
| `size` | `number` | `10` | lado do quadrado; o raio é `size / 2` |

#### Comportamento

- **Ficar parado desfaz a animação, não só para de começá-la** (`PulseDot.tsx:54-60`):
  `if (!live) { progress.value = 0; return; }`. Motivo: *"leaving the halo wherever the
  last frame put it reads as a dot with a permanent ring around it, which is the same lie
  in a different shape."*
- Animação: `withRepeat(withTiming(1, { duration: motion.pulseMs, easing: Easing.out(Easing.ease) }), -1, false)`
  — 2.600 ms (`PulseDot.tsx:64-68`).
- Halo: `transform: [{ scale: 1 + progress.value * 1.9 }]` e
  `opacity: 0.55 * (1 - Math.min(1, progress.value / 0.7))` (`PulseDot.tsx:76-79`) —
  cresce até 2,9× e some antes do fim do ciclo (aos 70%).
- Estrutura: uma `View` de `size × size` com `accessibilityElementsHidden`
  (`PulseDot.tsx:82`), o halo em `StyleSheet.absoluteFill` animado e o ponto sólido por
  cima, também em `absoluteFill`, os dois com `borderRadius: size / 2`.

#### Onde é usado

`src/home/Mosaic.tsx:417` (`<PulseDot live color={palette.apricot} />`) e `:445`
(`{(data?.running ?? []).length > 0 ? <PulseDot live color={palette.apricot} /> : null}`),
e `app/(tabs)/production.tsx:10`.

---

### 17.21 `QrCode`

**Arquivo:** `src/components/QrCode.tsx` (29 linhas). **Estado:** implementado e chamado.

#### Props

| Prop | Tipo | Padrão |
|---|---|---|
| `text` | `string` | — |
| `size` | `number` | `180` |

#### Comportamento

```tsx
const { path, span } = useMemo(() => qrPath(text), [text]);

<Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`} accessibilityRole="image">
  <Rect x="0" y="0" width={span} height={span} fill="#FFFFFF" />
  <Path d={path} fill="#000000" />
</Svg>
```

(`QrCode.tsx:21-27`.) Dois nós de SVG no total: um retângulo branco e **um caminho só**
com todos os módulos pretos.

#### As três decisões, e onde cada uma mora

O docblock (`QrCode.tsx:5-19`) diz que as três saem da mesma frase do `CLAUDE.md` sobre
a Fase 3 — *"QR a um braço de distância"*, com luva, a −18°C:

1. **A zona de silêncio e o caminho único moram no domínio**, em
   `src/domain/qr.ts`, *"e não aqui: são regra, não desenho, e dentro de um componente de
   React não havia como um teste alcançá-las. A mutação que zerava a margem branca
   sobreviveu à suíte inteira enquanto essa conta estava neste arquivo"*.
2. **Preto sobre branco, sempre.** *"O QR não herda o tema: em modo escuro, um código
   claro sobre fundo escuro é invertido e metade dos leitores recusa. O fundo branco é
   parte do código, não do estilo da tela."*

Do lado do domínio (`src/domain/qr.ts`), os números que o componente herda:

- `QUIET_ZONE = 4` módulos de branco em volta (`src/domain/qr.ts:51`);
- nível de correção **H** (30% de recuperação), escolhido porque *"com onze caracteres, os
  quatro níveis - L, M, Q e H - cabem na mesma grade de 21 por 21"* (`src/domain/qr.ts:27-32`);
- o conteúdo é o **código do lote** (`20260902-01`, onze caracteres) e não o uuid, porque
  o uuid exigiria a versão 3 (29×29) e *"numa etiqueta de quatro centímetros, o módulo cai
  de 1,9mm para 1,4mm"* (`src/domain/qr.ts:13-19`) — e porque *"o código do lote é legível
  por gente"* (`src/domain/qr.ts:21-25`);
- `span = modules.length + QUIET_ZONE * 2` → 21 + 8 = **29** para o código do lote
  (`src/domain/qr.ts:67`);
- um caminho só e não um retângulo por módulo: *"a grade tem 441 módulos, e 441 nós de SVG
  custam a cada quadro num celular barato - que é o que a fábrica compra"*
  (`src/domain/qr.ts:60-63`).

#### Onde é usado

`app/lots/[id].tsx:8`. Essa é também a única tela com exceção registrada de cor crua
(`src/language.test.ts:67-68`): *"a etiqueta é papel branco com tinta preta em qualquer
tema, porque é o que sai da impressora — o tema da tela não muda a cor da tinta."*

---

### 17.22 `Reveal`

**Arquivo:** `src/components/Reveal.tsx` (77 linhas). **Estado:** implementado e chamado
— pelo `CollapsingHeader` (que o aplica a todo filho de toda tela) e diretamente por 18
telas.

#### Para que serve

O docblock guarda a frase do dono e o diagnóstico (`Reveal.tsx:11-25`):

> *"O dono abriu o aplicativo publicado e disse a coisa mais difícil de responder com
> teste: 'o app todo estático, sem animação e nem graça nenhuma'. E ele estava certo de um
> jeito que o repositório já sabia — `motion.settle`, `motion.staggerMs` e
> `motion.pressScale` estão em `tokens.ts` desde o começo, documentados com cinco regras, e
> **nada** os usava fora do `PulseDot`. O sistema de movimento existia no papel."*
>
> *"A entrada é curta e uma vez só: sobe catorze pixels e aparece, com a mola `settle` que o
> resto do desenho já declarava. O escalonamento por índice é o que faz a tela parecer
> montada em vez de piscada — quarenta milissegundos entre um cartão e o próximo, que é
> abaixo do que se percebe como espera e acima do que se percebe como simultâneo."*

#### Props

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `index` | `number` | `0` | a posição na pilha; é o que escalona |
| `children` | `ReactNode` | — | — |
| `style` | `ViewStyle` | — | — |

#### Comportamento

- **`shown` começa em 1, e isso é decisão de segurança, não de estilo**
  (`Reveal.tsx:48-55`):

  > *"Se o valor inicial fosse invisível, qualquer falha no caminho da animação — o plugin
  > de worklets fora do babel, a biblioteca não carregando no navegador — deixaria a capa em
  > branco com o banco cheio de dado. Uma tela vazia por causa de enfeite é o pior defeito
  > possível numa fábrica. Começando visível, o pior caso é a tela aparecer sem a entrada."*

- No efeito, se o movimento não estiver reduzido: `shown.value = 0` e em seguida
  `shown.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle))`
  (`Reveal.tsx:62-63`).
- Estilo: `opacity: shown.value` e `transform: [{ translateY: (1 - shown.value) * 14 }]`
  (`Reveal.tsx:72-73`).
- As duas regras que o docblock nomeia (`Reveal.tsx:29-34`): *"**Movimento nunca atrasa
  informação.** A leitura de tela recebe o conteúdo montado desde o primeiro quadro; a
  animação é da caixa, não do texto."* e *"**Reduzir movimento apaga tudo e a tela continua
  inteira.**"*

#### Onde é usado

`src/components/CollapsingHeader.tsx:128` — aplicado a **todo** filho de **toda** tela
com cabeçalho. E diretamente em: `app/(tabs)/more.tsx`, `app/(tabs)/production.tsx`,
`app/(tabs)/reports.tsx`, `app/(tabs)/transport.tsx`, `app/assistant.tsx`,
`app/catalog.tsx`, `app/inputs/[id].tsx`, `app/inputs/index.tsx`, `app/inputs/new.tsx`,
`app/losses.tsx`, `app/lots/[id].tsx`, `app/orders/index.tsx`, `app/orders/new.tsx`,
`app/places.tsx`, `app/production/new.tsx`, `app/products/index.tsx`,
`app/products/new.tsx`, `app/purchase.tsx`, `app/recipes/[id].tsx`,
`app/recipes/index.tsx`, `app/settings.tsx`, `app/transfer.tsx`, `app/weather.tsx`,
`src/home/Mosaic.tsx`.

`src/language.test.ts:31,104-116` obriga: **toda tela precisa conter a palavra
`Reveal`**, ou delegar para quem contém.

---

### 17.23 `Sky`

**Arquivo:** `src/components/Sky.tsx` (263 linhas). **Quatro exports.** **Estado:**
`skyInk`, `SkyMark` e `TemperatureRange` chamados por `src/home/Mosaic.tsx`;
`temperatureBand` **só é chamada dentro do próprio arquivo**.

#### Por que este arquivo é o que é — a faixa de céu que morreu

O docblock (`Sky.tsx:14-49`) é o registro de uma versão inteira que foi jogada fora, e
vale transcrever porque é a decisão visual mais argumentada da pasta:

> *"O dono olhou a capa publicada e disse que o clima podia ficar muito mais bonito. A
> primeira resposta foi uma FAIXA de céu: um retângulo de 140 px com degradê entre duas
> cores da paleta, o sol por cima, e o texto embaixo. Ela nasceu do argumento certo — numa
> fábrica de sorvete o calor É o negócio, e o cartão que fala dele não pode ter a cara de
> uma linha de planilha — e resolveu o problema errado."*
>
> *"**O que as fotos mostraram**, nas três combinações:*
>
> - *__Orgânico claro, 33°:__ o degradê ia do verde da marca ao rosa. Duas cores de matiz
>   distante interpoladas em sRGB passam por LAMA no meio: o cartão ficou um hematoma de 140
>   px no alto da capa.*
> - *__Orgânico escuro:__ o mesmo bloco pastel, agora aceso numa tela preta, com o sol
>   desenhado em `onAccent` — que no escuro é quase preto. Um adesivo de outro aplicativo
>   colado na tela.*
> - *__Papel:__ sem degradê (a identidade dele é traço), sobrava um VAZIO de 92 px com um sol
>   no canto direito."*
>
> *"O defeito comum não é a cor escolhida: é a **área**. As cores desta paleta são tinta e
> traço — feitas para desenhar sobre um fundo claro ou escuro, não para PREENCHER um terço
> da tela. Ampliar uma cor de acento até virar fundo é o mesmo erro que ampliar `inkFaint`
> até virar texto de corpo: ela não foi medida para isso."*
>
> *"**O que ficou:** o desenho, do tamanho de um desenho, ao lado do número... A temperatura
> continua mandando na cena: ela decide a COR DO TRAÇO e o halo atrás dele. Trocar 31° por
> 12° troca o desenho inteiro sem tocar no código, e agora sem pintar um terço da capa."*

#### `temperatureBand(maxC): 'cold' | 'mild' | 'warm' | 'hot'`

```ts
if (maxC < 18) return 'cold';
if (maxC < 26) return 'mild';
if (maxC < 32) return 'warm';
return 'hot';
```

(`Sky.tsx:53-58`.) *"A faixa em que o calor deste negócio muda de assunto"*
(`Sky.tsx:52`). **Exportada, mas nenhum arquivo fora de `Sky.tsx` a chama** — o único
chamador é `skyInk` na linha 77.

#### `skyInk(maxC, { palette, brand, skin }): string`

```ts
const band = temperatureBand(maxC);
if (band === 'cold') return palette.sky;
if (band === 'mild') return skin === 'organico' ? brand : palette.mint;
return band === 'warm' ? palette.sand : palette.apricot;
```

(`Sky.tsx:73-83`.) A assinatura recebe `{ palette: Palette; brand: string; skin: Skin }`.

Duas decisões escritas (`Sky.tsx:60-72`):

- **A rampa para no terracota.** *"`rose` era o topo e saiu ROSA na foto, que nesta paleta
  é a cor do Espelho da Loja e vizinha do vermelho de perigo. Trinta e três graus numa
  fábrica de sorvete não é perigo, é o melhor dia do mês — pintá-lo de alerta ensina a ler
  alerta como enfeite, que é o mesmo defeito do alerta inventado, pelo lado da cor."*
- **É exportada porque o cartão inteiro usa:** *"o filete da borda, o traço do desenho e a
  régua do dia são a mesma cor, e um cartão com a borda azul e um sol rosa dentro é duas
  coisas na mesma peça."*
- **No Orgânico, o morno é a marca escolhida** — *"quem trocou o verde por âmbar não quer
  um dia morno verde"* (`Sky.tsx:79-80`).

#### `SkyMark`

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `maxC` | `number` | — | decide a cor via `skyInk` |
| `rainChance` | `number \| null` | — | ≥ 30 troca o sol pela nuvem |
| `size` | `number` | `76` | lado do quadrado |

- `const raining = rainChance !== null && rainChance >= 30` (`Sky.tsx:103`)
- `const traco = papel ? 1.7 : 2.2` (`Sky.tsx:130`)
- **Animações:** `spin` de 40.000 ms e `drift` de 9.000 ms, ambos lineares e infinitos
  (`Sky.tsx:117-118`). O comentário: *"Uma volta a cada quarenta segundos. É movimento que
  se percebe se você olhar, e não se percebe se você estiver trabalhando - que é o único
  tipo de animação que pode ficar numa tela o dia inteiro"* (`Sky.tsx:114-116`).
- `sunTurn`: `rotate: ${spin * 360}deg`. `cloudDrift`:
  `translateX: Math.sin(drift * Math.PI * 2) * 4` (`Sky.tsx:125-128`).

**O halo** (`Sky.tsx:134-148`) — só no Orgânico. `RadialGradient id="halo"` com
`cx="50%" cy="50%" r="50%"` e três paradas: `0 → stopOpacity 0.30`,
`0.65 → 0.10`, `1 → 0`, todas na cor `tinta`. Preenche um `Circle` de raio `size / 2`.
Comentário: *"A temperatura sentida antes de lida, e some antes de virar bloco. Raio
inteiro, opacidade que cai a zero na borda — assim ele não tem contorno, que é o que faria
dele mais um retângulo colorido."*

**O sol** (`Sky.tsx:152-172`) — `viewBox="0 0 68 68"`. Um `Circle cx=34 cy=34 r=13` de
contorno, e **oito raios gerados em laço**:

```tsx
Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  return <Line x1={34 + Math.cos(angle)*20} y1={34 + Math.sin(angle)*20}
               x2={34 + Math.cos(angle)*27} y2={34 + Math.sin(angle)*27} … />;
})
```

ou seja, raios do raio 20 ao 27, a cada 45 graus. *"Some quando chove de verdade —
desenhar sol num dia de chuva é a mesma mentira do alerta inventado"* (`Sky.tsx:150-151`).

**A nuvem** (`Sky.tsx:178-201`) — caminho
`M14 34 a11 11 0 0 1 11 -11 a14 14 0 0 1 27 5 a9 9 0 0 1 -2 19 H19 a9 9 0 0 1 -5 -13 Z`,
com três traços de chuva:
`x1={24 + i*12} y1={52} x2={21 + i*12} y2={62}`, `stroke={palette.sky}`,
`opacity={0.9 - i * 0.15}` — cada gota um pouco mais fraca que a anterior. Comentário:
*"A nuvem vagueia quatro pixels para cada lado: o bastante para a cena estar viva, pouco o
bastante para ninguém reparar enquanto lança produção. A chuva é azul mesmo no dia quente —
quem olha quer saber se molha, e a temperatura já está dita no número ao lado"*
(`Sky.tsx:174-177`).

#### `TemperatureRange`

| Prop | Tipo | Padrão | O que faz |
|---|---|---|---|
| `minC` | `number` | — | início da barra |
| `maxC` | `number` | — | fim da barra |
| `ink` | `string` | `palette.apricot` | a cor do dia |

*"A régua do dia: onde a mínima e a máxima caem dentro do dia inteiro. Lei 3 desenhada em
vez de escrita — 21° sozinho não diz nada; 21° ocupando o pedaço quente de uma barra que
vai de 13° a 21° diz o dia inteiro num relance"* (`Sky.tsx:207-211`).

**A escala é fixa, de 0 a 40 graus:** `const clamp = (c: number) => Math.max(0, Math.min(1, c / 40));`
(`Sky.tsx:239`), com o motivo escrito: *"Fixa de propósito - uma régua que se estica para
caber no dado faria 18° e 34° desenharem a mesma barra, e a comparação entre dois dias
morreria"* (`Sky.tsx:236-238`).

A barra: `left: ${from * 100}%`, `width: ${(to - from) * 100 * grown.value}%`
(`Sky.tsx:244-245`). Animação `withTiming(1, { duration: 900 })` (`Sky.tsx:229`). Trilho:
`height: 6`, `borderRadius: 3`, `backgroundColor: color.sunken`, `overflow: 'hidden'`,
`marginTop: space.sm` (`Sky.tsx:250-256`).

#### Onde é usado

`src/home/Mosaic.tsx:13` importa os três chamados. `skyInk` em `:59`
(`const corDoDia = sky ? skyInk(sky.today.maxC, { palette, brand, skin }) : palette.sky`),
`SkyMark` em `:305`, `TemperatureRange` em `:308` (hoje, com `ink={corDoDia}`) e `:330`
(cada dia da semana, **sem** `ink` — cai no âmbar da casa).

---

### 17.24 `Sparkline`

**Arquivo:** `src/components/Sparkline.tsx` (123 linhas). **Estado:** implementado e
chamado por quatro telas.

#### Para que serve

*"A linha de uma série, desenhada como se alguém tivesse acabado de traçá-la. O dono pediu
obra de arte, e a diferença entre um gráfico e um desenho é o gesto: a linha ENTRA, da
esquerda para a direita, no tempo que uma mão levaria — e o último ponto ganha um pingo que
assenta depois, que é onde o olho para"* (`Sparkline.tsx:19-23`).

#### Props

| Prop | Tipo | Padrão |
|---|---|---|
| `values` | `readonly number[]` | — |
| `hue` | `string` | `accent` |
| `width` | `number` | `220` |
| `height` | `number` | `44` |
| `strokeWidth` | `number` | `2` |

#### A aritmética mora no domínio

```ts
const points = sparkPoints(values, width, height, strokeWidth + 1);
const line = sparkPath(points);
const area = sparkArea(points, height);
const last = points[points.length - 1];
```

(`Sparkline.tsx:52-55`.) *"O caminho em si vem do domínio, já conferido: aqui dentro não
há aritmética de dado nenhuma"* (`Sparkline.tsx:27-28`).

De `src/domain/spark.ts`:

- `sparkPoints(values, width, height, padding = 2)` — escala vertical é a da própria
  série; série de um ponto só desenha no **meio** da caixa
  (`{ x: width / 2, y: top + usable / 2 }`, `src/domain/spark.ts:42`); série constante
  também vai ao meio (`share = span === 0 ? 0.5 : …`, `:50`), porque *"grudada embaixo,
  ela pareceria uma semana de fracasso"* (`:26-27`).
- `sparkPath(points)` — Catmull-Rom convertido para Bézier cúbica, tensão 1/6:
  `c1 = { x: p1.x + (p2.x - p0.x) / 6, … }`, `c2 = { x: p2.x - (p3.x - p1.x) / 6, … }`
  (`src/domain/spark.ts:77-78`). *"mais que isso e a curva passa a inventar picos entre
  dois dias — a linha ficaria mais bonita e mentiria sobre um dia que não existiu"* (`:62-64`).
- `sparkArea(points, height)` — o mesmo caminho fechado até o chão.
- Todos os números vão a duas casas (`round`, `src/domain/spark.ts:94-96`).

#### O gesto

- `const desenho = motion.countMs;` → 1.250 ms (`Sparkline.tsx:49`) — *"rápido o bastante
  para não atrasar a leitura, lento o bastante para o olho ver a linha nascer"*
  (`Sparkline.tsx:47-48`).
- `const length = Math.ceil(Math.hypot(width, height) * Math.max(1, points.length));`
  (`Sparkline.tsx:60`) — comprimento do traço, com a justificativa: *"não precisa ser
  exato: qualquer valor maior que a curva esconde o traço inteiro, e a curva nunca passa da
  diagonal da caixa vezes o número de segmentos"* (`Sparkline.tsx:57-59`).
- `drawn = withTiming(1, { duration: desenho })`;
  `settled = withDelay(desenho, withSpring(1, { damping: 14, stiffness: 160 }))`
  (`Sparkline.tsx:74-75`). Com reduce-motion os dois viram 1 direto.
- `traco`: `strokeDashoffset: length * (1 - drawn.value)` (`Sparkline.tsx:82-84`) — é
  `stroke-dasharray` com o traço inteiro escondido, *"que é a única forma de 'escrever' uma
  curva sem recalcular o caminho quadro a quadro"* (`Sparkline.tsx:25-27`).
- `pingo`: `r: 3.2 * settled.value`, `opacity: settled.value` (`Sparkline.tsx:85-88`).
- **Retorna `null` quando não há pontos** (`Sparkline.tsx:90`).

#### O desenho

`View` de `width: '100%'` e altura `height`. `Svg width="100%" height={height}
viewBox="0 0 {width} {height}" preserveAspectRatio="none"` (`Sparkline.tsx:94`).

- `LinearGradient id="spark"` vertical: `offset 0` na cor com `stopOpacity="0.28"`,
  `offset 1` com `stopOpacity="0"` (`Sparkline.tsx:96-99`).
- A área é desenhada primeiro, **sem gesto**: *"ele é o peso da linha, não a linha. Animar
  os dois competindo deixa o cartão inquieto"* (`Sparkline.tsx:102-103`).
- A linha: `stroke={cor}`, `strokeLinecap="round"`, `strokeLinejoin="round"`,
  `fill="none"`, `strokeDasharray={length}`.
- O pingo: `ACircle` em `last.x, last.y`, `fill={cor}`, `stroke={tint(cor, 0.35)}`,
  `strokeWidth={3}` (`Sparkline.tsx:118`).

#### Onde é usado

| Tela | Série | Cor |
|---|---|---|
| `app/places.tsx:526` | leituras de ambiente | `fora ? color.danger : palette.sky` |
| `app/inputs/[id].tsx:701` | histórico de taxa do insumo (`h.newRate`), invertido | `palette.sky` |
| `app/(tabs)/reports.tsx:159` | custo unitário das corridas com taxa congelada | `palette.sky` |
| `src/home/Mosaic.tsx:499` | `r.baseUnits` das corridas | `palette.sand` |
| `src/home/Mosaic.tsx:777` | `r.unitCostRate` | `palette.sky` |

Todas passam `strokeWidth={traco}` (1,7 no Papel, 2,2 no Orgânico).

---

### 17.25 `Touchable`

**Arquivo:** `src/components/Touchable.tsx` (54 linhas). **Estado:** implementado e
chamado.

#### Para que serve

*"Um toque sem resposta visual é a diferença entre um aplicativo e uma foto de um
aplicativo — e num celular de fábrica, com luva e tela suja, é também a única confirmação
de que o toque pegou. A escala de 0,97 e a mola `press` estavam em `tokens.ts` sem um
único chamador"* (`Touchable.tsx:11-15`).

E a decisão de arquitetura: *"Fica sobre `Pressable`, e não sobre o `Card`, porque nem
todo cartão é tocável: cartão que não leva a lugar nenhum não deve afundar como se
levasse"* (`Touchable.tsx:16-18`).

#### Props

| Prop | Tipo | Obrigatório | O que faz |
|---|---|---|---|
| `onPress` | `() => void` | **sim** | — |
| `accessibilityLabel` | `string` | **sim** | um cartão tocável sem rótulo não compila |
| `children` | `ReactNode` | sim | — |
| `style` | `ViewStyle` | não | vem **antes** do `squeeze` na pilha |

#### Comportamento

`const squeeze = useAnimatedStyle(() => ({ transform: [{ scale: 1 - held.value * (1 - motion.pressScale) }] }))`
(`Touchable.tsx:34-36`) — de 1 a 0,97. `onPressIn` → `withSpring(1, motion.press)`;
`onPressOut` → `withSpring(0, motion.press)`. `accessibilityRole="button"`.
**Não consulta reduce-motion.**

#### Onde é usado

`app/(tabs)/more.tsx`, `app/(tabs)/production.tsx`, `app/(tabs)/reports.tsx`,
`app/(tabs)/transport.tsx`, `app/inputs/new.tsx`, `app/places.tsx`,
`app/production/new.tsx`, `app/products/index.tsx`, `app/products/new.tsx`,
`app/recipes/index.tsx`, `app/settings.tsx`, `src/home/Mosaic.tsx`, `src/home/Peca.tsx`.

---

### 17.26 `UnitStepper`

**Arquivo:** `src/components/UnitStepper.tsx` (190 linhas). **Estado: implementado, sem
nenhum chamador em `app/` ou `src/`.**

Isto **não é defeito**: é fronteira registrada em três lugares.

- `CLAUDE.md:353`: *"Três vezes numa sessão eu apontei 'violação de fundação' no que era
  fronteira registrada: o `UnitStepper` sem uso (é componente da Fase 2)…"*
- `src/dictionary.test.ts:44-45`, na lista `ESCRITAS_ADIANTADO`: a seção `stepper` do
  dicionário tem como justificativa *"o UnitStepper, componente da Fase 2 — decisão
  registrada no CLAUDE.md, e apontá-lo como defeito já custou uma rodada"*.
- `README.md:152` o lista entre os componentes da pasta.

#### Para que serve

*"Quantity entry, in the operator's own words. Nobody in a cold room thinks in '3,600
popsicles' - they think in '12 crates'. So the tier is picked first, the amount is stepped
with large targets rather than typed on a keyboard, and the arithmetic is echoed back in
full underneath"* (`UnitStepper.tsx:12-18`).

*"The echo is the whole point: it removes mental math, which is where miscounts come from,
and it lets the person catch a wrong tier before committing"* (`UnitStepper.tsx:19-20`).

#### Props

| Prop | Tipo | Obrigatório | O que faz |
|---|---|---|---|
| `hierarchy` | `PackagingHierarchy` | sim | `{ tiers: PackagingTier[] }`, menor primeiro, o primeiro sempre com `perBaseUnit === 1` |
| `locale` | `LocaleSettings` | sim | para `formatQuantity` |
| `tierLabel` | `(tierId: string, count: number) => string` | sim | resolve o id de camada para um substantivo com plural no idioma da tela |
| `value` | `number` | sim | quantidade atual, **sempre em unidades-base** — *"storage never sees a tier"* |
| `onChange` | `(baseUnits: number) => void` | sim | — |
| `labels` | `{ decrease: string; increase: string }` | sim | rótulos de acessibilidade dos botões |
| `initialTierId` | `string` | não | em qual camada começar |

`PackagingTier = { id: string; perBaseUnit: number }` e
`PackagingHierarchy = { tiers: PackagingTier[] }` (`src/domain/units.ts:14-24`).

#### `initialTierId` e a exceção da produção

O padrão é a **maior** camada (`UnitStepper.tsx:51-56`):

```ts
(initialTierId ? hierarchy.tiers.find((t) => t.id === initialTierId) : undefined)
  ?? [...hierarchy.tiers].reverse()[0]
  ?? hierarchy.tiers[0]
```

*"Defaults to the largest, because that is how a cold room thinks - twelve crates, not
three thousand six hundred popsicles. Production is the exception, and the design canvas
draws it: the kettle put out 250 units, and the crates are the CONSEQUENCE, echoed
underneath. So that screen starts on the base unit and the echo does the packing"*
(`UnitStepper.tsx:40-47`).

#### Comportamento

- `const countInTier = Math.round(value / tier.perBaseUnit);` (`UnitStepper.tsx:58`)
- **O eco** (`UnitStepper.tsx:60-67`): `breakdown(value, hierarchy)` devolve a decomposição
  da maior camada para a menor, descartando zeros (`src/domain/units.ts:46-58`); cada parte
  vira `` `${formatQuantity(part.quantity, locale)} ${tierLabel(part.tier.id, part.quantity)}` ``
  e as partes são juntadas com `' · '`. Lista vazia → `tierLabel(hierarchy.tiers[0].id, 0)`.
  O texto é prefixado por `'= '` (`UnitStepper.tsx:129`).
- **O passo** (`UnitStepper.tsx:69-73`):
  ```ts
  const next = Math.max(0, countInTier + delta);
  void Haptics.selectionAsync();
  onChange(toBaseUnits(next, tier));
  ```
  `toBaseUnits(quantity, tier) = Math.round(quantity * tier.perBaseUnit)`
  (`src/domain/units.ts:35-37`). **Nunca desce abaixo de zero.**
- **O segmento de camadas só aparece com mais de uma camada:**
  `hierarchy.tiers.length > 1` (`UnitStepper.tsx:77`). Fundo `color.sunken`,
  `borderRadius: radius.pill`, `padding: space.xs`; `accessibilityRole="radiogroup"`, e
  cada opção com `accessibilityRole="radio"`, `accessibilityState={{ selected }}` e
  `accessibilityLabel={tierLabel(option.id, 2)}` (o `2` força o plural). A selecionada
  ganha fundo `color.surface` e texto `color.ink`; as outras ficam em `color.inkMuted`.
- **O número:** `type.hero` (56 px), `flex: 1`, centralizado, tabular, com
  `accessibilityLiveRegion="polite"` (`UnitStepper.tsx:119-124`).
- **O sublinhado decorativo:** `View` de `height: 2`, `borderRadius: 2`, `width: 32`,
  `opacity: 0.4`, cor `accent`, centralizado (`UnitStepper.tsx:132, 189`).

#### `StepButton`

68×68, `borderRadius: 34`, `borderWidth: 1`, **fundo transparente**, borda
`color.lineStrong`, símbolo `−` / `+` em `fontSize: 30` / `lineHeight: 34`, cor
`color.ink` (`UnitStepper.tsx:160-171, 181-188`). O comentário de estilo do StyleSheet
diz *"48dp minimum: this is pressed with gloves on, in the cold"* (`UnitStepper.tsx:180`)
— e o botão real tem 68. A mola é `withSpring(pressed ? 0.92 : 1, motion.press)`
(`UnitStepper.tsx:150`) — **0,92, não `motion.pressScale`**; é o único ponto do
aplicativo que usa uma escala de pressão diferente de 0,97.

O contorno vazio é decisão escrita: *"Só contorno, como o canvas desenha: um alvo de 68
pontos que não compete com o número no meio. Fundo cheio aqui faria dois botões gritarem
ao lado do único número que a tela é sobre"* (`UnitStepper.tsx:162-164`).

#### O dicionário que o espera

`src/i18n/locales/pt-BR.ts` (seção `stepper`):

| Chave | pt-BR |
|---|---|
| `echo` | `'{{parts}}'` — com o comentário *"The echo that removes mental math: '12 engradados = 72 caixas = 3.600 picolés'"* |
| `decrease` | `'Diminuir'` |
| `increase` | `'Aumentar'` |

---

### 17.27 `WhatsNew`

**Arquivo:** `src/components/WhatsNew.tsx` (119 linhas). **Estado:** implementado e
chamado.

#### Para que serve

*"The honest half of a silent update. Updates install themselves, which is the only way
this works for someone who will never visit an app store. But an app that changes
overnight without saying so teaches people not to trust what they are looking at. So: it
updates on its own, and the first time you open it afterwards it tells you what moved -
once, in three lines, and never again"* (`WhatsNew.tsx:13-20`).

#### Props

**Nenhuma.** É montado uma vez, acima de todas as telas.

#### Chave de armazenamento

```ts
const SEEN_KEY = `${brand.slug}:release-seen`;   // → 'norva:release-seen'
```

(`WhatsNew.tsx:10`, com `brand.slug = 'norva'` em `src/config/brand.ts:15`.) Fica no
`AsyncStorage`.

#### A máquina de estados

`WhatsNew.tsx:34-49`:

| `seen` lido | O que acontece |
|---|---|
| `=== latestRelease.version` | nada — já foi visto |
| `=== null` (primeira instalação) | grava a versão atual **em silêncio** e não mostra nada |
| qualquer outra coisa | `setVisible(true)` |

O caso da primeira instalação tem motivo escrito: *"Nothing was updated on a first
install, and saying so would be the app's first sentence to somebody who has not decided
to trust it yet. So the current release is filed as already seen, silently, and the sheet
waits for a real update to have something true to report"* (`WhatsNew.tsx:38-41`).

**Falhas de armazenamento são engolidas de propósito** (`WhatsNew.tsx:21-23`): *"If the
key cannot be read the worst case is showing the notice twice; refusing to open the app
over a missing preference would be far worse."* Todos os `.catch(() => undefined)`.

`dismiss()` esconde e grava (`WhatsNew.tsx:56-59`).

#### O conteúdo

Vem de `src/config/releases.ts`:

```ts
export const latestRelease: Release = {
  version: '2026.09.01',
  date: '2026-09-01',
  lines: [
    'O custo de cada produto agora se recalcula sozinho quando você lança uma nota de compra.',
    'Você pode perguntar em português: toque em "Pergunte" e escreva o que quer saber.',
    'Em Ajustes dá para apagar os dados de exemplo, por área ou de uma vez.',
  ],
};

export function releaseLines(release: Release = latestRelease): string[] {
  return release.lines.slice(0, 3);
}
```

O corte de três é imposto na função, *"not left to whoever edits the list next"*
(`src/config/releases.ts:30`), e a regra de origem: *"at most three lines, never shown
twice... Three lines is the budget because the fourth never gets read"*
(`src/config/releases.ts:5-7`). E `version` *"Not the app version - the version of __this
notice__"* (`src/config/releases.ts:14`).

**As linhas de release NÃO passam pelo i18n** — são strings em português cravadas no
arquivo de configuração.

#### O desenho

`Modal transparent animationType="slide"`. Fundo `Pressable` `rgba(0,0,0,0.35)` com
`accessibilityLabel="Fechar"` — **string em português cravada no componente**
(`WhatsNew.tsx:63`), única do arquivo que não vem do dicionário. Folha com
`borderTopLeftRadius`/`borderTopRightRadius: radius.xl`, `paddingTop: space.md`,
`paddingBottom: insets.bottom + space.lg`, `paddingHorizontal: space.lg`; pegador 38×4.
Cada linha leva um marcador de 6×6 na cor `accent`, com `marginTop: 9`
(`WhatsNew.tsx:84-88, 117`). Botão em `accent`, `radius.pill`.

Textos (`src/i18n/locales/pt-BR.ts:52-56`):

| Chave | pt-BR |
|---|---|
| `t.app.whatsNew.title` | "Novidades" |
| `t.app.whatsNew.subtitle` | "O aplicativo se atualizou sozinho. Isto é o que mudou." |
| `t.app.whatsNew.dismiss` | "Entendi" |

#### Onde é usado

`app/_layout.tsx:114`, irmão do `<Stack>` dentro do `ConfirmProvider`, com o comentário
*"Sits above every screen: the update may land on any of them."*

---

### 17.28 `WhySheet`

**Arquivo:** `src/components/WhySheet.tsx` (153 linhas). **Estado:** implementado e
chamado por uma tela.

#### Para que serve

*"The sheet behind every `[por quê?]`. The law it serves: no conclusion in this app is
unauditable. For someone who does not yet trust software with their money, being able to
open the arithmetic is what turns 'the app said so' into 'the app is right' - and it is
only possible because the number came from deterministic math over the ledger rather than
from a guess"* (`WhySheet.tsx:10-16`).

*"It rises from the bottom, as every choice in this app does; a centred dialog is reserved
for destructive actions"* (`WhySheet.tsx:17-19`).

#### Props

| Prop | Tipo | O que faz |
|---|---|---|
| `visible` | `boolean` | controla o `Modal` |
| `onClose` | `() => void` | fundo tocável e `onRequestClose` |
| `cost` | `RecipeCost` | a conta inteira |
| `locale` | `LocaleSettings` | formatação |
| `title` | `string` | o título da folha |

`RecipeCost` (`src/domain/recipe.ts:81-102`) carrega `recipeId`, `version`,
`batchCents: Cents`, `netYield: number`, `perYieldUnit: Rate`, `lines: CostLine[]` e
`lossFraction: number`. O campo `lines` existe exatamente para isto: *"The arithmetic,
kept alongside the answer. Every intelligent statement in this app must be able to open
its own calculation"* (`src/domain/recipe.ts:94-99`).

#### Comportamento

- **As linhas são ordenadas por participação, decrescente:**
  `const sorted = [...cost.lines].sort((a, b) => b.share - a.share);` (`WhySheet.tsx:38`)
  — cópia, não mutação do array de entrada.
- Cada linha desenha: rótulo (`numberOfLines={1}`, `flex: 1`) + `formatMoney(line.totalCents, locale)`
  em tabular 600; depois **uma barra**, com `width: ${Math.max(1, Math.round(line.share * 100))}%`
  — piso de 1% para a linha nunca sumir (`WhySheet.tsx:81`), fundo `accent`,
  `borderRadius: 99`, sobre um trilho `color.sunken` de `height: 6`. *"The bar is the
  point: it shows what dominates the cost at a glance, which is the question behind opening
  this sheet"* (`WhySheet.tsx:76-77`).
- A legenda: `fill(t.whySheet.shareOfBatch, { percent: formatPercent(line.share, locale, 0) })`.
- **O rodapé de três resumos** (`WhySheet.tsx:96-113`):

| Linha | Rótulo | Valor |
|---|---|---|
| 1 | `t.whySheet.batchCost` = "Custo do lote" | `formatMoney(cost.batchCents, locale)` |
| 2 | `fill(t.whySheet.expectedLoss, { percent: formatPercent(cost.lossFraction, locale) })` = "Perda prevista ({{percent}})" | `fill(t.whySheet.remains, { amount: formatQuantity(cost.netYield, locale) })` = "sobram {{amount}}" |
| 3 (`strong`) | `t.whySheet.perMassUnit` = "Custo por unidade de massa" | `fill(t.whySheet.perAmount, { money: formatMoney(Math.round(cost.perYieldUnit * 1000), locale), amount: formatQuantity(1000, locale) })` = "{{money}} / {{amount}}" |

- **O mil da terceira linha passa pelo formatador**, e isso é cicatriz escrita: *"Mil
  unidades-base, escritas pelo formatador e não à mão: '1.000' cravado na string é o ponto
  de milhar do português dentro de uma tela que também abre em inglês, onde o mesmo mil é
  '1,000'"* (`WhySheet.tsx:105-107`).
- A nota de rodapé: `t.whySheet.lossNote` = *"A perda encarece o que sobra: o lote é pago
  inteiro, mas só parte dele chega ao cliente."*

#### `Summary`

Sub-componente local (`WhySheet.tsx:124-145`): linha com `alignItems: 'baseline'`,
`gap: 12`, `paddingVertical: space.xs`; rótulo em `type.secondary` (`color.ink` se
`strong`, senão `color.inkMuted`), valor em `type.secondary` `color.ink` com
`fontWeight: strong ? '600' : '400'` e figura tabular.

#### O dicionário (`src/i18n/locales/pt-BR.ts`, seção `whySheet`)

| Chave | pt-BR |
|---|---|
| `close` | "Fechar" |
| `where` | "De onde sai esse número" |
| `shareOfBatch` | "{{percent}} do lote" |
| `batchCost` | "Custo do lote" |
| `expectedLoss` | "Perda prevista ({{percent}})" |
| `remains` | "sobram {{amount}}" |
| `perMassUnit` | "Custo por unidade de massa" |
| `perAmount` | "{{money}} / {{amount}}" |
| `lossNote` | "A perda encarece o que sobra: o lote é pago inteiro, mas só parte dele chega ao cliente." |

#### Desenho da folha

`Modal transparent animationType="slide"`; fundo `rgba(0,0,0,0.35)` com
`accessibilityLabel={t.whySheet.close}`; folha com `maxHeight: '80%'`,
`borderTopLeftRadius`/`borderTopRightRadius: radius.xl`, pegador 38×4, título em
`type.section`, subtítulo em `type.secondary` `color.inkMuted`, e o corpo num
`ScrollView`. Divisor de `StyleSheet.hairlineWidth` com `marginVertical: 16`
(`WhySheet.tsx:147-152`).

#### Onde é usado

`app/recipes/[id].tsx:12`. É o único chamador.

---

### 17.29 `confirm.test.ts`

**Arquivo:** `src/components/confirm.test.ts` (63 linhas). Não é componente: é o guard
que protege a decisão do `Confirm`.

#### Por que existe

*"A guard for the bug that cost an evening: `Alert` does nothing on the web. Every
confirmation in this app went through `Alert.alert`, so in a browser the app asked
questions nobody saw and waited for answers that never came - saving an input, recording
an invoice and erasing everything all silently did nothing, and no test noticed because
the code was correct on the platform the tests do not run on"* (`confirm.test.ts:7-14`).

E a estratégia: *"There is no way to unit test a platform's dialog. What can be tested is
that the app never reaches for it again"* (`confirm.test.ts:15-18`).

#### Os dois casos

**1. `no screen uses the platform Alert, which is a no-op on the web`**
(`confirm.test.ts:31-43`). Varre recursivamente `app/` (`.ts` e `.tsx`) e reprova
qualquer arquivo que case com:

```js
/import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/
```

*"The import is what matters: `Alert` reaching a screen at all is the bug"*
(`confirm.test.ts:34`). Mensagem de falha: *"use useConfirm() from @/components/Confirm
instead - Alert never appears in a browser"*.

**2. `every screen that writes something asks before it does`**
(`confirm.test.ts:45-62`). Acha os arquivos de `app/` que chamam qualquer uma de seis
funções de escrita:

```js
/\b(saveItem|saveProduct|saveRecipeVersion|recordPurchase|eraseArea|restoreStarterData)\s*\(/
```

Primeiro afirma `writers.length >= 5` (*"the writing screens should be findable"* — a
guarda contra o teste passar de graça por a lista ter mudado de nome), e depois exige que
cada um contenha `useConfirm()`. Mensagem de falha: *"`<arquivo>` writes without asking
anybody first"*.

---

### 17.30 O que esta seção NÃO conseguiu determinar

- **Por que `Button`, `Touchable`, `ListRow` e `UnitStepper` não consultam
  `AccessibilityInfo.isReduceMotionEnabled()`** enquanto todos os outros consultam. O
  padrão é consistente (entrada e ciclo consultam; resposta ao dedo não), mas **NÃO ESTÁ
  NO CÓDIGO** nenhum comentário que declare essa fronteira.
- **Por que `StepButton` usa `0.92` em vez de `motion.pressScale` (0,97).** O comentário
  ao lado fala do preenchimento e do tamanho do alvo, não da escala (`UnitStepper.tsx:162-164`).
- **Por que `Bars` usa a mola local `{ damping: 16, stiffness: 120 }` e o atraso de
  120 ms** em vez de `motion.settle` e `motion.staggerMs`. NÃO ESTÁ NO CÓDIGO.
- **Por que `TemperatureRange` usa `withTiming(1, { duration: 900 })`** — 900 ms não é
  nenhum token de `motion`. NÃO ESTÁ NO CÓDIGO.
- **Qual tela vai chamar `GlyphStick`, `IconStock`, `IconCost` e `IconLoss`.** Ao
  contrário do `UnitStepper` e da seção `stepper` do dicionário, **nenhum desses quatro
  desenhos tem fronteira registrada** em `CLAUDE.md`, em `docs/insights.md` ou numa lista
  de exceção testada. `IconStock` chega a ter um docblock que afirma um chamador que não
  existe mais.
- **Se `temperatureBand` é exportada para uso futuro ou por descuido.** O docblock
  justifica por escrito a exportação de `skyInk` (*"Exportada porque o cartão inteiro
  usa"*, `Sky.tsx:70-72`), mas não diz nada sobre `temperatureBand`.
- **O texto exato de `accessibilityLabel="Fechar"` no `WhatsNew`** não passa pelo
  dicionário e portanto não tem tradução em inglês nem espanhol. Não há comentário
  dizendo se isso é intencional.
- **Nenhum componente desta pasta tem teste de renderização.** O que existe é `confirm.test.ts`
  (que varre `app/`), `src/language.test.ts` (que varre `app/`) e os testes de geometria
  em `src/domain/spark.ts` / `src/domain/qr.ts`. Não há `react-test-renderer` nem
  `@testing-library` nas dependências (`package.json`).

---

### 17.31 Por que os números desta seção venceram — e o roadmap não vence

Em 10 de setembro três afirmações desta seção estavam erradas ao mesmo tempo, e nenhuma
delas por descuido de quem escreveu: elas eram **verdadeiras no dia em que foram escritas**.

| o que a seção dizia | o que era verdade em 10 de setembro |
|---|---|
| "27 arquivos … 3.621 linhas" | 41 arquivos soltos, 6.359 linhas, mais a subpasta `cenas/` |
| `UnitStepper` **SEM CHAMADOR** | chamado por `app/picking.tsx:358` desde que a separação em engradados existe |
| `CountUp` "só `src/home/Mosaic.tsx`" | mais `src/home/capas/organico.tsx` e cinco telas |

**A causa é estrutural e vale registrar para quem reconstruir.** Este repositório resolveu
o problema de documento que envelhece — duas vezes, com dois mecanismos:

- `src/bar.test.ts` deriva do sistema todo número que o projeto afirma sobre si (telas,
  tabelas, migrações, papéis, testes) e cobra que os documentos digam o mesmo.
- `src/plano.test.ts` faz o mesmo para a FILA: cada item do roadmap carrega um comentário
  `<!-- medida: ausente|presente|espera ... -->`, e no dia em que alguém constrói o que a
  fila dá como aberto, a suíte fica vermelha.

**O dossiê não tem nenhum dos dois.** Ele é escrito à mão, não é gerado (o
`scripts/dossie.mjs` só COSTURA as seções num arquivo só), e nada o confere. Então ele
envelhece exatamente na velocidade em que o código muda, e em silêncio — que é a mesma
doença que os dois mecanismos acima existem para curar, num documento que se propõe a ser
o que SOBREVIVE ao repositório.

A classe de afirmação mais fácil de conferir por máquina, e a que já falhou aqui, é
**SEM CHAMADOR**: são 28 delas no dossiê inteiro, cada uma dizendo que um símbolo existe
e ninguém o usa. É a mesma pergunta do portão P1 (*"quem chama isto no mesmo commit?"*),
e um `grep` a responde. Está anotada como item aberto no `docs/roadmap.md`.

*Esta subseção existe porque a alternativa era corrigir os três números em silêncio, e aí
o próximo leitor herdaria a mesma confiança que eu tinha antes de medir.*

---

### 17.32 `src/nav.ts` — a saída do aplicativo, uma vez só

Não é componente e não mora em `src/components/`; está documentado aqui porque é o que as
seções 19, 20 e 21 chamam toda vez que uma tela termina o que veio fazer.

```ts
export function voltar(destino: string = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(destino as never);
}
```

**Por que a pergunta.** Quem entra por LIGAÇÃO PROFUNDA — o QR do engradado lido na doca,
o aviso de validade tocado na notificação — chega numa tela com a pilha vazia atrás, e ali
`router.back()` não volta: fecha o aplicativo. Medido no aparelho em 10 de setembro,
partida fria em `norva://losses`, um toque no voltar, `mCurrentFocus` no launcher. São
exatamente as duas portas que o produto promete.

**O caminho que NÃO se tomou, e por quê.** `unstable_settings = { anchor: '(tabs)' }` é o
que a documentação do expo-router oferece para este defeito, e ele conserta o aparelho e
quebra a web: a tela aberta por ligação profunda passa a ser montada como o segundo cartão
da pilha e fica deslocada uma largura inteira (janela de 412 px, elemento em x = 607), sem
nunca deslizar para o lugar — quem abre um link vê a capa. Perguntar "há para onde voltar?"
resolve nos dois lugares e não mexe em como a pilha é montada.

**A guarda é `src/nav.test.ts`**, e ela existe porque o conserto é POR CHAMADA: nenhuma
tela pode chamar `back`, `goBack`, `dismiss` ou `dismissTo` direto (a varredura ignora
comentários, senão acusaria o docblock do `app/who.tsx`, que cita o defeito para
explicá-lo), e a âncora não pode voltar sem alguém medir a web antes.

**A história, porque ela é a lição.** Duas telas — `app/who.tsx` e `app/scan.tsx` — já
faziam esta pergunta sozinhas, cada uma com o seu destino, e as outras dez chamavam
`back()` cru. `src/nav.ts` é uma EXTRAÇÃO do que já existia, não uma invenção: quando um
conserto mora em duas telas e não nas doze, ele não é regra do aplicativo — é coincidência
com dois exemplares.
