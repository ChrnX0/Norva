## 16. Sistema de tema: peles, esquemas, tokens e contraste

### 16.1 Os seis arquivos e o que cada um decide

| arquivo | linhas | responsabilidade única |
|---|---|---|
| `src/theme/tokens.ts` | 400 | Todo hexadecimal, toda medida, toda constante de movimento. Nenhum React. |
| `src/theme/scheme.ts` | 57 | A regra pura de claro/escuro: `SchemeChoice`, `SCHEMES`, `SCHEME_PADRAO`, `resolveScheme` |
| `src/theme/Appearance.tsx` | 136 | Estado e persistência da escolha (pele, paleta da paisagem, luz) na gaveta local |
| `src/theme/ThemeProvider.tsx` | 118 | Monta o objeto `Theme` que as telas leem; injeta a serifa; resolve o acento da área |
| `src/theme/scheme.test.ts` | 47 | Quatro testes sobre `resolveScheme` e as três escolhas |
| `src/theme/contrast.test.ts` | 132 | Três testes que medem contraste WCAG lendo o TEXTO de `tokens.ts` |

Cadeia de dependência, de baixo para cima: `tokens.ts` (sem dependências) → `scheme.ts`
(importa só o tipo `ColorScheme`) → `Appearance.tsx` (importa `scheme.ts`, os tipos `Hue`
e `Skin`, e `@/data/meta`) → `ThemeProvider.tsx` (importa os três) → telas
(`src/theme/ThemeProvider.tsx:1-15`, `src/theme/Appearance.tsx:1-4`, `src/theme/scheme.ts:1`).

---

### 16.2 A doutrina das duas famílias de cor

Escrita no topo do arquivo de tokens e é o que explica por que a paleta tem a forma que
tem (`src/theme/tokens.ts:1-19`), transcrita:

- **AMBIENT** — dessaturada, uma por área do aplicativo. Diz **ONDE** você está. Aparece
  em exatamente quatro lugares: o trilho de 3 px do cartão, o ícone do cabeçalho, o botão
  primário e um traço de gráfico. **Nunca como superfície inteira**: um cartão totalmente
  colorido cansa os olhos de quem encara a tela oito horas.
- **SIGNAL** — saturada, só em doses pequenas. Diz **O QUE** está acontecendo. Nunca
  decora. Se o verde aparecer num gráfico porque ficou bonito, o verde deixa de significar
  "conferido" e a pessoa para de confiar em cor.
- **Cor nunca viaja sozinha**: todo estado carrega também a sua palavra, porque há gente
  daltônica e há tela ruim sob luz de galpão.

Essa doutrina foi **parcialmente revogada por decisão do dono** para o cartão: o `Card`
hoje pinta fundo lavado de 8% (claro) ou 13% (escuro) do tom da área, depois de o dono
dizer *"por que tudo esse tipo de card? tem que ter um pouco de fofura"*
(`src/components/Card.tsx:22-42`, `src/components/Card.tsx:92-95`). O trilho continua,
agora como borda inteira mais forte (24% no claro, 34% no escuro).

---

### 16.3 As oito cores ambientes e a área de cada uma

`export const ambient` é uma tupla `as const` de oito nomes (`src/theme/tokens.ts:21-30`),
e `export type Ambient = (typeof ambient)[number]` (`src/theme/tokens.ts:32`).

`export const ambientArea: Record<Ambient, string>` (`src/theme/tokens.ts:35-44`):

| cor ambiente | área declarada em `ambientArea` |
|---|---|
| `sky` | `home` |
| `apricot` | `production` |
| `mint` | `inventory` |
| `lilac` | `distribution` |
| `rose` | `storeMirror` |
| `sage` | `purchasing` |
| `sand` | `finance` |
| `mist` | `settings` |

**Estado: `ambient` (a tupla) e `ambientArea` (o mapa) estão implementados e NÃO TÊM
CHAMADOR.** Nenhum arquivo fora de `src/theme/` importa qualquer um dos dois — a única
coisa que atravessa é o *tipo* `Ambient`, importado por `app/(tabs)/_layout.tsx:12` e usado
na assinatura `icon(Icon, area: Ambient)` em `app/(tabs)/_layout.tsx:84`. A associação
real área→cor vive espalhada em 24 telas, escrita à mão na prop `area` do `AreaProvider`.

Área declarada por tela (implementado e chamado por tela), com o valor exato do atributo
`area="…"`:

| tela | área |
|---|---|
| `app/(tabs)/index.tsx` | `sky` |
| `app/(tabs)/production.tsx` | `apricot` |
| `app/(tabs)/transport.tsx` | `lilac` |
| `app/(tabs)/reports.tsx` | `sand` |
| `app/(tabs)/more.tsx` | `mist` |
| `app/assistant.tsx` | `sky` |
| `app/weather.tsx` | `sky` |
| `app/catalog.tsx` | `sand` |
| `app/inputs/index.tsx` | `mint` |
| `app/inputs/[id].tsx` | `mint` |
| `app/inputs/new.tsx` | `mist` |
| `app/places.tsx` | `mint` |
| `app/losses.tsx` | `apricot` |
| `app/lots/[id].tsx` | `apricot` |
| `app/production/new.tsx` | `apricot` |
| `app/products/index.tsx` | `apricot` |
| `app/products/new.tsx` | `apricot` |
| `app/recipes/index.tsx` | `apricot` |
| `app/recipes/[id].tsx` | `apricot` |
| `app/orders/index.tsx` | `sage` |
| `app/orders/new.tsx` | `sage` |
| `app/purchase.tsx` | `sage` |
| `app/transfer.tsx` | `lilac` |
| `app/settings.tsx` | `mist` |

Note as três divergências entre `ambientArea` e o uso real: `sand` é declarado como
`finance` e é usado para **relatórios** e **catálogo**; `sage` é `purchasing` e é usado
também para **pedidos**; `rose` (`storeMirror`) **não é usado por nenhuma tela** — só
aparece como token de paleta.

A barra de abas repete o mesmo mapa, por ícone (`app/(tabs)/_layout.tsx:111-145`):
`index`→`sky`, `production`→`apricot`, `transport`→`lilac`, `reports`→`sand`,
`more`→`mist`. O ícone recebe `palette[area]`, ou seja, a cor da área **mesmo quando a
aba não está selecionada**; o único sinal de seleção é a cor do rótulo indo de
`color.inkFaint` para `color.ink` (`app/(tabs)/_layout.tsx:68`, `app/(tabs)/_layout.tsx:88`).

---

### 16.4 Anatomia de uma paleta: as 21 chaves

Toda paleta do sistema tem **exatamente as mesmas 21 chaves**, na mesma ordem, e nenhuma
delas é montada por espalhamento (`...`) — o operador não aparece uma única vez em
`src/theme/tokens.ts`. O tipo é `export type Palette = typeof lightPalette`
(`src/theme/tokens.ts:132`), e as quatro paletas de pele são anotadas `: Palette`, o que
faz falta de chave quebrar a compilação.

| chave | papel na tela |
|---|---|
| `paper` | O chão da tela. `CollapsingHeader` pinta a moldura inteira e o topo com ela (`src/components/CollapsingHeader.tsx:63`, `:69`); a barra de abas também (`app/(tabs)/_layout.tsx:100`) |
| `surface` | O fundo do cartão sem tom, no Orgânico (`src/components/Card.tsx:138`) |
| `sunken` | Camada afundada; usada como cor da nuvem no escuro da paisagem (`src/components/Landscape.tsx:167`) |
| `ink` | Tinta forte: o dado, o título, o número |
| `inkMuted` | Tinta média: o corpo, a explicação, o rótulo do botão fantasma (`src/components/Button.tsx:126`) |
| `inkFaint` | Tinta fraca: o rótulo que diz O QUE o número é, em 11 e 13 px |
| `line` | Régua fina, borda de cartão sem tom |
| `lineStrong` | Régua forte; a sublinha da ação secundária no Papel (`src/components/Button.tsx:112`) |
| `onAccent` | A cor do texto **em cima** de um preenchimento de acento (`src/components/Button.tsx:122`, `:126`) |
| `sky` `apricot` `mint` `lilac` `rose` `sage` `sand` `mist` | As oito cores ambientes |
| `ok` `warning` `danger` `neutral` | Os quatro sinais |

Não existe chave de sombra, de elevação nem de opacidade na paleta — ver §16.13.

---

### 16.5 As seis paletas, hexadecimal por hexadecimal

O arquivo declara **seis** paletas. Duas delas (`lightPalette` e `darkPalette`) formam o
"tema base"; quatro formam as duas peles.

#### 16.5.1 Tabela mestra — todos os tokens de todas as paletas

| token | `lightPalette` | `darkPalette` | `papelClaro` | `papelEscuro` | `organicoClaro` | `organicoEscuro` |
|---|---|---|---|---|---|---|
| `paper` | `#F7F6F3` | `#141414` | `#FAF7F2` | `#1B1610` | `#F3F7F3` | `#0C1512` |
| `surface` | `#FFFFFF` | `#1E1E1E` | `#FFFFFF` | `#241E17` | `#FFFFFF` | `#13201B` |
| `sunken` | `#EFEDE8` | `#262626` | `#F1EDE5` | `#2C251C` | `#E7EFE8` | `#1A2B24` |
| `ink` | `#23211E` | `#EDEBE7` | `#221F1B` | `#F4ECE0` | `#16281D` | `#EAF5EE` |
| `inkMuted` | `#57534D` | `#ADA9A2` | `#554D43` | `#BCAE9A` | `#425249` | `#9DB8A9` |
| `inkFaint` | `#6D6963` | `#928D88` | `#706960` | `#998C7E` | `#5F6D63` | `#80948A` |
| `line` | `#E7E4DE` | `#333130` | `#DCD3C6` | `#4A3F33` | `#DDE9DF` | `#1C2F27` |
| `lineStrong` | `#D7D3CA` | `#454240` | `#CBBEAC` | `#5E5142` | `#C6D8CA` | `#2A443A` |
| `onAccent` | `#FFFFFF` | `#141414` | `#FFFFFF` | `#1B1610` | `#FFFFFF` | `#0C1512` |
| `sky` | `#3F7096` | `#8FB6D8` | `#2C5A7A` | `#8FA3AE` | `#5B8EC9` | `#7FB6E8` |
| `apricot` | `#A75F3A` | `#E2A283` | `#A8371A` | `#E08A5A` | `#E29B52` | `#F0A868` |
| `mint` | `#2F7D6B` | `#6FC4AE` | `#3F6B4A` | `#9AB294` | `#2F7D5C` | `#5EF2A8` |
| `lilac` | `#67589C` | `#AB9BDD` | `#6A4A57` | `#BE9AA4` | `#6B7FD0` | `#A79BEA` |
| `rose` | `#A3505C` | `#DE97A2` | `#8E3346` | `#C99098` | `#C4677A` | `#E58FA0` |
| `sage` | `#5A7B49` | `#A2BE8C` | `#5A7040` | `#A8BC92` | `#5A7B49` | `#A2BE8C` |
| `sand` | `#9A7429` | `#D9B76A` | `#8A6414` | `#D9B76A` | `#B28E42` | `#E5C377` |
| `mist` | `#6E6A64` | `#A8A39B` | `#6F6558` | `#A8A39B` | `#8BA192` | `#7F9A8C` |
| `ok` | `#2F7D5A` | `#5DBF92` | `#3F6B4A` | `#93B79A` | `#2F7D5C` | `#5EF2A8` |
| `warning` | `#C7841E` | `#E0AB53` | `#8A6414` | `#D9B76A` | `#C2751F` | `#F5A35E` |
| `danger` | `#C0453C` | `#E0766D` | `#9E2A2A` | `#D08268` | `#C0453C` | `#F5715E` |
| `neutral` | `#6E6A65` | `#A8A39B` | `#6F6558` | `#B6A894` | `#4D6055` | `#9DB8A9` |

Fontes, bloco a bloco: `lightPalette` em `src/theme/tokens.ts:74-98`; `darkPalette` em
`src/theme/tokens.ts:105-129`; `papelClaro` em `src/theme/tokens.ts:221-258`; `papelEscuro`
em `src/theme/tokens.ts:273-300`; `organicoClaro` em `src/theme/tokens.ts:302-326`;
`organicoEscuro` em `src/theme/tokens.ts:328-352`.

#### 16.5.2 O tema base — implementado, medido, e SEM CHAMADOR

`export const palettes = { light: lightPalette, dark: darkPalette }`
(`src/theme/tokens.ts:131`) e `export type ColorScheme = keyof typeof palettes`
(`src/theme/tokens.ts:133`).

**Nenhum arquivo do repositório importa `palettes`.** O `ThemeProvider` importa
`skins`, não `palettes` (`src/theme/ThemeProvider.tsx:5-15`), e a tela lê a paleta do
contexto, nunca do arquivo — decisão registrada no docblock do campo `palette`
(`src/theme/ThemeProvider.tsx:20-28`): *"Existia como `palettes[scheme]` importado direto
do arquivo de tokens em doze telas — o que funcionava enquanto havia uma paleta só. Com
duas identidades, ler a paleta pelo esquema ignora qual cara está no ar, e a tela desenha
metade de uma e metade da outra."*

Consequência que precisa ficar escrita para quem reconstruir: **as duas paletas do tema
base não pintam pixel nenhum, e mesmo assim são medidas pelo teste de contraste**, porque
o teste varre o texto do arquivo (§16.8). Duas das seis paletas do sistema de garantia são
código morto do ponto de vista da tela. `ColorScheme` (o tipo) continua vivo: é o retorno
de `resolveScheme` e o campo `scheme` do tema.

#### 16.5.3 O que o dono cobrou em cada pele, com as frases registradas no código

- **Papel claro** — a primeira versão era terrosa e discreta; o dono disse *"está muito
  apagado, quero mais contraste entre os elementos coloridos"*, e o que mudou foi **só a
  saturação dos tons de área** — o creme, a tinta e a serifa ficaram (`src/theme/tokens.ts:208-220`).
- **Papel claro, segunda rodada** — *"as cores e todo o resto não combinam"*. O
  diagnóstico escrito: os tons eram os do Orgânico com outra saturação — verde `#15803D` e
  lilás `#5B4BA8` são cores de interface, frias, e brigam com um creme quente do mesmo
  jeito que marcador fluorescente briga com papel de carta. Os de hoje são de impressão:
  verde-garrafa, azul-tinta, roxo-tinta, ocre (`src/theme/tokens.ts:232-241`). O `lilac`
  virou **ameixa** `#6A4A57` e não violeta, por ser a última cor fria que sobrava na
  família (`src/theme/tokens.ts:245-248`).
- **Papel escuro** — *"esse é o tema dark?"*. O diagnóstico: com a caixa do cartão fora
  (que é o que o Papel pede), sobrou tudo boiando num preto quase puro com réguas de
  `#2F271F` que ninguém enxerga. O chão subiu para **carvão quente** e as linhas subiram
  junto (`src/theme/tokens.ts:260-271`). É por isso que `papelEscuro.line` é `#4A3F33` e
  `lineStrong` é `#5E5142`, muito mais claros que os `#333130`/`#454240` do tema base.
- **Escuro é cinza neutro, não azul-marinho** — as cores ambientes clareiam para
  continuarem legíveis sobre cinza e encolhem ainda mais para função de acento: cinza
  domina, cor acentua (`src/theme/tokens.ts:100-104`).

#### 16.5.4 As cores que NENHUM teste mede

O teste de contraste mede **só** `ink`/`inkMuted`/`inkFaint` contra
`paper`/`surface`/`sunken` (`src/theme/contrast.test.ts:28-30`). Os oito ambientes e os
quatro sinais **não entram na régua**. Medindo-os com a mesma fórmula do próprio teste,
contra `surface` (o fundo do cartão no Orgânico), o resultado é este — números derivados,
não afirmados por nenhuma guarda do repositório:

| token | `lightPalette` | `darkPalette` | `papelClaro` | `papelEscuro` | `organicoClaro` | `organicoEscuro` |
|---|---|---|---|---|---|---|
| `sky` | 5,29 | 7,82 | 7,37 | 6,30 | **3,41** | 7,81 |
| `apricot` | 4,84 | 7,72 | 6,51 | 6,25 | **2,32** | 8,40 |
| `mint` | 4,92 | 8,08 | 6,15 | 7,20 | 4,99 | 11,79 |
| `lilac` | 6,08 | 6,72 | 7,69 | 6,56 | **3,77** | 6,82 |
| `rose` | 5,44 | 7,19 | 7,74 | 6,23 | **3,77** | 7,01 |
| `sage` | 4,81 | 8,16 | 5,49 | 8,07 | 4,81 | 8,22 |
| `sand` | 4,28 | 8,68 | 5,37 | 8,59 | **3,07** | 9,92 |
| `mist` | 5,37 | 6,65 | 5,71 | 6,58 | **2,76** | 5,52 |
| `ok` | 5,00 | 7,41 | 6,15 | 7,45 | 4,99 | 11,79 |
| `warning` | **3,11** | 8,03 | 5,37 | 8,59 | **3,58** | 8,23 |
| `danger` | 5,05 | 5,54 | 7,45 | 5,56 | 5,05 | 5,92 |

Como `onAccent` é branco puro nos três temas claros e o `paper` da pele nos escuros, a
tabela acima é **também** a legibilidade do texto do botão primário: no Orgânico o
preenchimento é o acento da área (`src/components/Button.tsx:68`), então "Lançar produção"
no Orgânico claro é branco sobre `#E29B52`, que mede **2,32:1**. Isso não é afirmação de
defeito — é medida, e o repositório **não a testa**.

As cinco marcas de paisagem, medidas contra o branco (o `onAccent` do Orgânico claro) e
contra `#0C1512` (o do Orgânico escuro): `verde #2F7D5C` 4,99 / 3,72 · `azul #2E6DA4`
5,47 / 3,39 · `ambar #C2751F` 3,58 / 5,18 · `terracota #B4552D` 4,91 / 3,78 ·
`lavanda #6B5FA8` 5,49 / 3,38.

---

### 16.6 As três tintas: a hierarquia e o passo mínimo de 1,35×

#### 16.6.1 O que cada tinta pinta

`inkFaint` pinta o rótulo que diz **o que** o número é — "por mil", "valor parado",
"conferido em 3/9" — em 11 e 13 px (`src/theme/tokens.ts:47-54`). `inkMuted` pinta o corpo
e a explicação. `ink` pinta o dado. A hierarquia é **forte > média > fraca em toda
paleta** (`src/theme/tokens.ts:56-59`).

#### 16.6.2 O primeiro defeito medido: ilegível na câmara

A auditoria mediu `inkFaint` em **2,55:1** no tema que sai da caixa, com **124 corridas de
texto de 11 e 13 px** pintadas com ele (`src/theme/contrast.test.ts:9-13`,
`docs/auditoria.md:213-216`). Ilegível no corredor da câmara, com luva, tela suja e luz de
galpão, que é onde este aplicativo é usado — e é o **rótulo**, não o dado, o que quebra a
Lei 3 ("nenhum número aparece sozinho").

A régua adotada é a da WCAG para texto normal, **4,5:1**, com a justificativa escrita: este
projeto não tem texto grande o bastante para a régua de 3:1 valer — a maior fonte de corpo
é 15 px, e as três camadas de tinta são usadas em 11, 13 e 15
(`src/theme/contrast.test.ts:15-17`, `src/theme/contrast.test.ts:32`).

Os valores **antigos** de `inkFaint`, recuperáveis do commit `2d5a34a` ("Tinta legível no
corredor da câmara, com a régua escrita antes da cor"), e o contraste que cada um dava:

| paleta | `inkFaint` antigo | sobre `paper` | sobre `surface` | sobre `sunken` |
|---|---|---|---|---|
| `lightPalette` | `#8A857D` | 3,39 | 3,66 | 3,13 |
| `darkPalette` | `#7A756E` | 4,03 | 3,65 | 3,31 |
| `papelClaro` | `#A2988A` | 2,66 | 2,84 | 2,43 |
| `papelEscuro` | `#8A7C6B` | 4,43 | 4,07 | 3,73 |
| `organicoClaro` | `#8BA192` | **2,55** | 2,76 | **2,35** |
| `organicoEscuro` | `#6B8377` | 4,54 | 4,11 | 3,63 |

Duas correções que o próprio projeto registrou sobre a auditoria: eram **seis** paletas e
não quatro, e 2,55 era o **pior caso** (Orgânico claro sobre `paper`) apresentado como o
número de todas (`docs/auditoria.md:123-132`, `docs/insights.md:3334-3341`). O documento
diz que a faixa medida era "2,35 a 4,43"; refazendo a medição com a fórmula do próprio
teste, o topo da faixa é **4,54** (`organicoEscuro` sobre `paper`) — a diferença não muda
o achado, porque nenhuma das dezoito combinações passava de 4,5.

A regra de correção que ficou escrita: *para cada paleta, escureça (ou clareie) mantendo o
matiz até o pior fundo passar de 4,6* (`docs/insights.md:3346-3347`). "4,6 e não 4,5"
é a casa de folga citada em `src/theme/tokens.ts:53-54`.

#### 16.6.3 O segundo defeito, causado pelo conserto do primeiro

Subir `inkFaint` até a régua empurrou a tinta fraca **para cima da média** nos dois temas
claros. No Papel, depois do primeiro conserto (`docs/insights.md:3541-3552`,
`src/theme/contrast.test.ts:100-111`):

| camada | contraste sobre o papel |
|---|---|
| `ink` | 15,35 |
| `inkMuted` | **5,34** |
| `inkFaint` | **5,07** |

Cinco por cento de diferença — que existe na conta e não existe no olho. **Três camadas de
tinta viraram duas** e a tela que separa rótulo de corpo por tom ficou plana. Quem viu foi
o dono, abrindo o aplicativo: *"cadê o tema papel light"* / *"você fez o dark, ficou ok.
falta o light."* (`src/theme/tokens.ts:64-66`, `docs/insights.md:3538-3539`).

O passo medido no estado intermediário, refeito a partir dos valores do commit
`77b4f30`, com `inkMuted` antigo `#6F6558` (Papel) e `#4D6055` (Orgânico):

| paleta clara | média | fraca | passo `média/fraca` |
|---|---|---|---|
| `papelClaro` | 5,34 | 5,07 | **1,05×** |
| `organicoClaro` | 6,22 | 5,04 | **1,24×** |

Os dois temas **escuros**, que não tinham sido tocados na tinta média, mediam **1,5×** — e
é por isso que o escuro parecia pronto e o claro não (`src/theme/tokens.ts:70-72`,
`src/theme/contrast.test.ts:112`).

**A guarda que existia passou.** Ela pedia ordem (`média > fraca`), e 5,34 > 5,07 passa.
A frase que ficou: *ordem não é hierarquia* (`src/theme/tokens.ts:68-69`,
`src/theme/contrast.test.ts:129-130`). O conserto foi escurecer o `inkMuted` das duas
paletas claras: `#6F6558` → `#554D43` no Papel, `#4D6055` → `#425249` no Orgânico.

#### 16.6.4 A constante e a regra que ficaram

```ts
const PASSO = 1.35;
```

(`src/theme/contrast.test.ts:113`). O piso é 1,35× de **razão de contraste entre camadas
vizinhas**, medido sempre contra `paper`, e o motivo escrito é que 1,35 não é gosto: os
dois temas escuros, que estavam certos, já mediam 1,5×
(`src/theme/contrast.test.ts:110-112`).

A regra generalizada, como o projeto a escreveu: **guarda de grandeza contínua precisa de
passo mínimo, não de ordem.** Onde houver escala — tinta, tamanho de fonte, espaçamento,
opacidade —, a pergunta certa nunca é "está na ordem?", é "a distância entre dois vizinhos
é grande o bastante para alguém perceber?" (`docs/insights.md:3559-3563`).

---

### 16.7 Contraste medido hoje: o que o sistema entrega

Números derivados rodando a própria fórmula do teste contra o arquivo de tokens atual.
Todas as dezoito combinações da régua passam de 4,5; o mínimo do sistema é **4,60**
(`darkPalette.inkFaint` sobre `sunken`).

| paleta | tinta | sobre `paper` | sobre `surface` | sobre `sunken` |
|---|---|---|---|---|
| `lightPalette` | `ink` | 14,86 | 16,06 | 13,73 |
| `lightPalette` | `inkMuted` | 7,07 | 7,64 | 6,53 |
| `lightPalette` | `inkFaint` | 5,05 | 5,45 | 4,66 |
| `darkPalette` | `ink` | 15,47 | 14,00 | 12,71 |
| `darkPalette` | `inkMuted` | 7,87 | 7,12 | 6,47 |
| `darkPalette` | `inkFaint` | 5,60 | 5,07 | **4,60** |
| `papelClaro` | `ink` | 15,35 | 16,41 | 14,05 |
| `papelClaro` | `inkMuted` | 7,77 | 8,30 | 7,11 |
| `papelClaro` | `inkFaint` | 5,07 | 5,41 | 4,64 |
| `papelEscuro` | `ink` | 15,33 | 14,08 | 12,91 |
| `papelEscuro` | `inkMuted` | 8,26 | 7,59 | 6,96 |
| `papelEscuro` | `inkFaint` | 5,48 | 5,03 | 4,61 |
| `organicoClaro` | `ink` | 14,32 | 15,49 | 13,21 |
| `organicoClaro` | `inkMuted` | 7,66 | 8,28 | 7,07 |
| `organicoClaro` | `inkFaint` | 5,04 | 5,45 | 4,65 |
| `organicoEscuro` | `ink` | 16,61 | 15,03 | 13,28 |
| `organicoEscuro` | `inkMuted` | 8,72 | 7,89 | 6,97 |
| `organicoEscuro` | `inkFaint` | 5,76 | 5,22 | 4,61 |

E o passo entre camadas, contra `paper`, que é o que a segunda guarda mede. O piso é 1,35;
a folga mais apertada do sistema é **1,40×** (as duas paletas do tema base):

| paleta | forte | média | fraca | `forte/média` | `média/fraca` |
|---|---|---|---|---|---|
| `lightPalette` | 14,86 | 7,07 | 5,05 | 2,10 | **1,40** |
| `darkPalette` | 15,47 | 7,87 | 5,60 | 1,97 | **1,40** |
| `papelClaro` | 15,35 | 7,77 | 5,07 | 1,98 | 1,53 |
| `papelEscuro` | 15,33 | 8,26 | 5,48 | 1,86 | 1,51 |
| `organicoClaro` | 14,32 | 7,66 | 5,04 | 1,87 | 1,52 |
| `organicoEscuro` | 16,61 | 8,72 | 5,76 | 1,91 | 1,51 |

---

### 16.8 O que `contrast.test.ts` prova, mecanismo por mecanismo

**Estado: implementado e rodando na barra (`npm test` → `tsx --test 'src/**/*.test.ts'`,
`package.json:13`). Os três testes passam.**

#### 16.8.1 Ele lê o TEXTO do arquivo, não os objetos

```ts
const FONTE = readFileSync('src/theme/tokens.ts', 'utf8');
```

(`src/theme/contrast.test.ts:25`). A justificativa está escrita e é uma decisão de desenho
do teste (`src/theme/contrast.test.ts:19-23`): importar traria os objetos já montados, e o
teste passaria a medir o que a herança produziu, não o que está escrito. Lendo o texto,
cada paleta é medida com a cor que alguém digitou ali — e **uma cor nova, colada amanhã,
entra na medição sem ninguém acrescentar nada**.

Nota factual: o docblock justifica isso dizendo que *"o `Palette` do Papel herda campos do
Orgânico por espalhamento"*. **Isso não é verdade no arquivo de hoje** — não existe um
único `...` em `src/theme/tokens.ts`, e as seis paletas são literais completos de 21
chaves. O comentário descreve um estado anterior.

#### 16.8.2 A fórmula, transcrita

```ts
const luminancia = (hex: string): number => {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
};

export const contraste = (a: string, b: string): number => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};
```

(`src/theme/contrast.test.ts:34-44`). É a luminância relativa da WCAG 2.x, com a
linearização sRGB, e a razão `(L1+0.05)/(L2+0.05)`. Aceita **só** hexadecimal de seis
dígitos: os índices `[1, 3, 5]` pulam o `#` e leem dois dígitos por canal. `contraste` é
exportada e **não tem importador fora do próprio arquivo**.

#### 16.8.3 O varredor de paletas, e a cicatriz dele

```ts
for (const m of FONTE.matchAll(/const (\w*[Pp]alette|\w*(?:Claro|Escuro))[^=]*= \{/g)) {
  const inicio = m.index ?? 0;
  const corpo = FONTE.slice(inicio, FONTE.indexOf('\n};', inicio));
  if (/\n(?:export )?(?:const|type|function) /.test(corpo)) continue;
  const cores: Record<string, string> = {};
  for (const c of corpo.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) cores[c[1]] = c[2];
  if (cores.paper && cores.ink) achadas.push({ nome: m[1], cores });
}
```

(`src/theme/contrast.test.ts:47-64`). Três filtros, cada um com razão escrita:

1. **O nome.** A expressão casa qualquer `const` cujo identificador termine em
   `Palette`/`palette` **ou** em `Claro`/`Escuro`. É por isso que dar um nome fora desse
   padrão a uma paleta nova a tira silenciosamente da medição.
2. **O bloco tem que fechar onde se pensa.** Se dentro do corpo aparecer outra declaração,
   o bloco não fechou no `\n};` esperado — foi o caso de `const palettes = { light, dark }`,
   que não tem cor nenhuma e **engoliu a paleta escrita abaixo dela, medindo a mesma coisa
   duas vezes com o nome errado** (`src/theme/contrast.test.ts:52-56`).
3. **Só o que é paleta de verdade**: precisa ter `paper` e `ink` (`src/theme/contrast.test.ts:61`).

#### 16.8.4 Teste 1 — a régua

`test('every ink the app writes text with is legible on every ground it writes on')`
(`src/theme/contrast.test.ts:66-90`). Varre `TINTAS = ['ink','inkMuted','inkFaint']` ×
`FUNDOS = ['paper','surface','sunken']` × todas as paletas achadas, e falha se qualquer
razão for menor que `MINIMO = 4.5`.

Duas defesas contra passar de graça:

- `assert.ok(todas.length >= 4, ...)` — se a leitura das paletas vier vazia ou curta, a
  comparação seria de graça (`src/theme/contrast.test.ts:68`).
- A asserção é `assert.deepEqual(fracas, [], mensagem)` e não um `ok`: a falha **imprime a
  lista inteira** no formato `paleta.tinta sobre fundo: R:1 (#hex / #hex)`
  (`src/theme/contrast.test.ts:77`), com a explicação de produto colada embaixo — *"Texto
  de 11 e 13 px pintado assim é ilegível no corredor da câmara, com luva e condensação — e
  é justamente o rótulo que diz O QUE o número é."* (`src/theme/contrast.test.ts:86-88`).

#### 16.8.5 Teste 2 — a régua é uma régua

`test('the ruler is a ruler: black on white passes, gray on gray does not')`
(`src/theme/contrast.test.ts:92-98`). Três asserções que não dependem de paleta nenhuma:

| asserção | valor |
|---|---|
| `contraste('#000000', '#FFFFFF') > 20` | preto no branco é 21:1 |
| `contraste('#777777', '#888888') < 1.5` | cinza em cinza não passa |
| `contraste('#123456','#FEDCBA') === contraste('#FEDCBA','#123456')` | contraste não tem ordem |

#### 16.8.6 Teste 3 — a hierarquia

`test('the three inks stay a hierarchy, not three names for one gray')`
(`src/theme/contrast.test.ts:115-132`). Para cada paleta, calcula os três contrastes
**contra `paper`** e exige `forte/média >= 1.35` e `média/fraca >= 1.35`. Mesma técnica de
falha: `deepEqual` contra lista vazia, com cada violação impressa como
`paleta: média/fraca = X` e a frase — *"O piso é 1.35× de razão de contraste entre camadas.
Ordem não é hierarquia: duas tintas a 5% de distância passam em 'maior que' e desenham a
mesma tela plana."* (`src/theme/contrast.test.ts:128-130`).

#### 16.8.7 A mutação plantada que prova que a guarda morde

`scripts/mutate.mjs:837-843` devolve a tinta velha do tema base:

| campo | valor |
|---|---|
| `file` | `src/theme/tokens.ts` |
| `from` | `  inkFaint: '#6D6963',` |
| `to` | `  inkFaint: '#8A857D',` |
| `hurts` | "a tinta do rotulo volta a 3,39:1 no tema que sai da caixa: 'por mil', 'valor parado' e 'conferido em' ficam ilegiveis no corredor da camara, com luva e tela suja - e a Lei 3 diz que numero nao aparece sozinho" |

O 3,39 do texto confere: `#8A857D` sobre `#F7F6F3` mede 3,39:1.

---

### 16.9 As duas peles (`Skin`)

```ts
export type Skin = 'papel' | 'organico';
```

(`src/theme/tokens.ts:206`). A decisão registrada: o dono viu quarenta esboços e escolheu
**duas** identidades, com claro e escuro, trocáveis nos ajustes — não é indecisão, são dois
negócios diferentes olhando a mesma tela. *"A fábrica que mostra o app para o contador quer
a página impressa; a que abre o celular na doca às seis da manhã quer a paisagem."*
(`src/theme/tokens.ts:190-204`).

**O que muda entre as peles**: a paleta, a família tipográfica, o raio dos cantos e o
cabeçalho. **O que NÃO muda**: a escala de tamanhos — corpo 17, herói 56 e figura 28
continuam iguais nas duas, *"porque essa escala não é estilo — é o tamanho que se lê numa
câmara fria, de luva, com a tela suja, e trocar isso por gosto seria trocar legibilidade
por decoração"* (`src/theme/tokens.ts:200-204`).

`export const skins` (`src/theme/tokens.ts:386-400`):

| campo | `papel` | `organico` |
|---|---|---|
| `light` | `papelClaro` | `organicoClaro` |
| `dark` | `papelEscuro` | `organicoEscuro` |
| `titleFamily` | `'serif'` | `undefined` |
| `radius.sm` | 4 | 12 |
| `radius.md` | 6 | 18 |
| `radius.lg` | 8 | 22 |
| `radius.xl` | 10 | 28 |
| `radius.pill` | 999 | 999 |

Sobre a família: `serif` no Papel e nulo no Orgânico — nulo quer dizer "a fonte do
sistema". `serif` é o **nome genérico** que Android e iOS resolvem sozinhos, sem embarcar
arquivo de fonte: *"um aplicativo que abre offline numa câmara fria não paga megabytes por
uma família de texto"* (`src/theme/tokens.ts:354-362`).

#### 16.9.1 As diferenças de pele escritas fora do arquivo de tokens

A pele não é só paleta e raio: ela muda a **forma** de quatro componentes, cada um lendo
`skin` do contexto.

| componente | Orgânico | Papel |
|---|---|---|
| `Card` (`src/components/Card.tsx:116-146`) | Bloco: fundo lavado `tint(tom, 0.08\|0.13)`, borda `tint(tom, 0.24\|0.34)`, `borderRadius: radius.xl`, `padding: space.lg`, trilho esquerdo de `RAIL_WIDTH` | Editorial: `backgroundColor: 'transparent'`, `borderRadius: 0`, **só régua no topo** — `borderTopWidth: 1.5` na cor do assunto (ou `hairlineWidth` em `color.line`), `paddingTop: space.md`, `paddingBottom: space.lg`, `paddingHorizontal: 0` |
| crachá do ícone (`src/components/Card.tsx:148-167`) | `View` de 40×40 com `tint(tom, 0.14\|0.22)` e `borderRadius: radius.lg` | **Sem crachá**: o desenho fica na página |
| `Button` (`src/components/Button.tsx:52,68,96,108-117`) | Pílula (`radius.pill`); preenchimento = **`accent`** (a cor da área); ação secundária com moldura em `color.lineStrong` | Retângulo (`radius.sm`); preenchimento = **`brand`**; ação secundária é palavra sublinhada (`borderBottomWidth: hairlineWidth*2`, `borderRadius: 0`) |
| `Chip` (`src/components/Chip.tsx:20-31`) | `radius.pill` | `radius.sm` |
| `CollapsingHeader` (`src/components/CollapsingHeader.tsx:75-81`) | Marca dentro de um selo: `backgroundColor: ${accent}22`, `borderRadius: 9`, `Mark size={15}` | Marca solta na página: `Mark size={18}`, sem selo |
| cena da capa (`src/home/Mosaic.tsx:107-126`) | `<Landscape …/>` — a paisagem com céu, colina, sol, nuvem e fumaça | `<FactoryScene …/>` — a linha de produção em traço |

Sobre o preenchimento do botão, a decisão está escrita e é uma inversão deliberada
(`src/components/Button.tsx:54-67`): numa folha de contato, as quatro telas apareceram com
quatro botões de cores diferentes; **cor de seção mora na régua e no desenho**. No Papel a
ação usa a marca; no Orgânico o acento por área continua, *"lá a cor é o assunto, e foi
assim que o dono escolheu"*.

**A espessura do traço dos ícones não é token.** `const traco = skin === 'papel' ? 1.7 : 2.2`
aparece escrito à mão em **26 lugares** — 24 telas mais `src/components/Sky.tsx:130` e
`src/home/Mosaic.tsx:56` (por exemplo `app/settings.tsx:178`, `app/places.tsx:104`,
`app/places.tsx:394`, `app/(tabs)/production.tsx:79`). Não existe `stroke` em
`src/theme/tokens.ts`.

---

### 16.10 As cinco paletas de paisagem (`Hue`) — só no Orgânico

```ts
export type Hue = 'verde' | 'azul' | 'ambar' | 'terracota' | 'lavanda';
```

(`src/theme/tokens.ts:376`). A decisão registrada: *"A paleta é bem verde; seria legal poder
escolher"* — e a escolha não é um botão de cor, ela move a **paisagem inteira**, porque no
Orgânico o céu e a colina são a identidade, não decoração de fundo. Trocar para âmbar é o
fim de tarde; para azul, a manhã fria (`src/theme/tokens.ts:363-375`).

**O que a escolha NÃO move são os sinais.** `ok`, `warning` e `danger` ficam fora do
registro de propósito: *"numa fábrica que escolhesse a paleta terracota, uma alta de custo
passaria a aparecer na cor do tema e deixaria de gritar"* (`src/theme/tokens.ts:370-374`).

`export const hues: Record<Hue, { brand; skyTop; skyBottom; hillFar; hillNear }>`
(`src/theme/tokens.ts:378-384`):

| matiz | `brand` | `skyTop` | `skyBottom` | `hillFar` | `hillNear` |
|---|---|---|---|---|---|
| `verde` | `#2F7D5C` | `#DFF0E6` | `#BFE3CF` | `#A9DCC0` | `#7CC9A6` |
| `azul` | `#2E6DA4` | `#DCEAFC` | `#BCD8F7` | `#A9C8E8` | `#7BA9D6` |
| `ambar` | `#C2751F` | `#FDEEDA` | `#FBDCB4` | `#F0CF9A` | `#E0B273` |
| `terracota` | `#B4552D` | `#FBE6DF` | `#F6CDC0` | `#EEB9A6` | `#DD9781` |
| `lavanda` | `#6B5FA8` | `#E9E4F8` | `#D4CBF0` | `#C3B9E6` | `#A396D4` |

**Estado: implementado e chamado por duas telas.** `app/settings.tsx:48,631` (o disco de
amostra, pintado com `hues[qual].brand` — a única cor escrita fora do tema em toda a tela,
e o comentário explica por quê: *"ele não representa a paleta, ele É a amostra dela"*,
`app/settings.tsx:598-605`) e `src/components/Landscape.tsx:11,70` (a cena).

Como a paisagem usa as cinco cores (`src/components/Landscape.tsx:120-148`):

- `skyTop` → topo do degradê do céu, com `stopOpacity` 1 se a máxima do dia for ≥ 26 °C e
  0,85 se não (`src/components/Landscape.tsx:111,124`) — *"o calor muda a saturação do céu,
  não a paleta"*.
- `skyBottom` → base do degradê.
- `hillFar` → a colina de trás (`Path d="M0 150c70-22 …"`).
- `hillNear` → a fábrica desenhada (telhado serrilhado e chaminé) e a colina da frente.

**A escuridão da paisagem não usa a paleta escura**: a função local
`noturno(hex, fator)` multiplica cada canal RGB pelo fator (`src/components/Landscape.tsx:46-52`),
com fatores fixos **0,30** para `skyBottom`, **0,42** para `hillFar`, **0,58** para a colina
da frente e **0,72** para a fábrica (`src/components/Landscape.tsx:125,132,134,146`). A
razão está escrita e é uma exceção declarada à regra do tema: *"a regra do tema ('escuro é
cinza neutro, cor só de acento') vale para SUPERFÍCIE, não para cena: uma colina não é
fundo de cartão, é a figura"* (`src/components/Landscape.tsx:34-45`). O defeito que gerou a
exceção: no escuro a paisagem pintava `sunken` sobre `surface` sobre `paper` — três cinzas
separados por dezoito unidades de brilho — e o dono mandou a foto de uma caixa preta com um
sol dentro.

Cores literais que a paisagem escreve fora do tema, para constar: sol `#FFD76A` (dia) /
`#F7E6B5` (noite), janelas `#FFFFFF` (dia) / `#F5C66A` (noite), gotas de chuva `#8EC5FC`
(`src/components/Landscape.tsx:139,153-154,173`).

---

### 16.11 O esquema de cor: `SchemeChoice` e `resolveScheme`

#### 16.11.1 O tipo e as constantes

```ts
export type SchemeChoice = 'claro' | 'escuro' | 'sistema';
export const SCHEMES: SchemeChoice[] = ['claro', 'escuro', 'sistema'];
export const SCHEME_PADRAO: SchemeChoice = 'claro';
```

(`src/theme/scheme.ts:25`, `:28`, `:38`). **O padrão é o claro — decisão do dono, 4 de
setembro** (`src/theme/scheme.ts:30-37`). A justificativa: *"um aplicativo de fábrica é
aberto na mão de quem está trabalhando, e a luz da fábrica é acesa. `sistema` continua
existindo para quem já configurou o celular para virar sozinho ao anoitecer — é o terceiro
caminho, não o único."*

#### 16.11.2 A função

```ts
export function resolveScheme(
  escolha: SchemeChoice,
  doAparelho: string | null | undefined,
): ColorScheme {
  if (escolha === 'claro') return 'light';
  if (escolha === 'escuro') return 'dark';
  return doAparelho === 'dark' ? 'dark' : 'light';
}
```

(`src/theme/scheme.ts:50-57`). Tabela verdade completa:

| `escolha` | `doAparelho` | resultado |
|---|---|---|
| `claro` | qualquer coisa (`'light'`, `'dark'`, `'unspecified'`, `null`, `undefined`) | `light` |
| `escuro` | qualquer coisa | `dark` |
| `sistema` | `'dark'` | `dark` |
| `sistema` | `'light'` / `'unspecified'` / `null` / `undefined` | `light` |

O segundo parâmetro é **largo de propósito**: o `ColorSchemeName` do React Native não é só
claro e escuro — ele também diz `'unspecified'`, e existe `null` num navegador que não
responde. Estreitar o parâmetro obrigaria quem chama a mentir num `as`, e a mentira ficaria
no lugar onde o defeito apareceria. *"Só `dark` escurece; qualquer outra resposta é o
claro"* (`src/theme/scheme.ts:40-49`).

#### 16.11.3 Por que a regra mora fora do componente

Cicatriz registrada duas vezes (`src/theme/scheme.ts:19-23`, `src/theme/scheme.test.ts:5-12`,
`src/theme/ThemeProvider.tsx:60-63`): a regra nasceu dentro do `ThemeProvider`, onde **só o
navegador podia prová-la** — e a suíte de mutação roda a unidade, não o navegador, então as
duas mutações que protegem esta regra teriam sobrevivido. *"Regra que só o e2e alcança é
regra protegida por vinte minutos de CI em vez de por milissegundos."*

As duas mutações plantadas (`scripts/mutate.mjs:83-102`):

| # | `from` | `to` | dano descrito |
|---|---|---|---|
| 1 | `  if (escolha === 'claro') return 'light';` | `  if (escolha === 'claro') return doAparelho === 'dark' ? 'dark' : 'light';` | "escolher Claro volta a nao valer nada: quem esta com o celular no escuro fica preso no escuro com o botao Claro aceso na tela" |
| 2 | `export const SCHEME_PADRAO: SchemeChoice = 'claro';` | `export const SCHEME_PADRAO: SchemeChoice = 'sistema';` | "o padrao deixa de ser o claro que o dono decidiu e volta a ser o do aparelho" |

#### 16.11.4 O que `scheme.test.ts` prova

Quatro testes (`src/theme/scheme.test.ts:14-47`), **implementados e rodando**:

| teste | o que afirma |
|---|---|
| `the default is light, which is the owner decision` | `SCHEME_PADRAO === 'claro'` e `resolveScheme(SCHEME_PADRAO, 'dark') === 'light'` — *"o padrão vale mesmo com o aparelho no escuro — foi exatamente esse o defeito relatado"* |
| `an explicit choice ignores the phone, in both directions` | Laço sobre `['light','dark','unspecified',null,undefined]`: `claro`→`light` e `escuro`→`dark` em todos |
| `following the phone actually follows the phone` | `sistema` com `'dark'`→`dark`; com `'light'`, `'unspecified'`, `null`, `undefined`→`light` |
| `the three paths all exist, and none of them is dropped` | `SCHEMES` é exatamente `['claro','escuro','sistema']`, tem comprimento 3, e contém `SCHEME_PADRAO` — a asserção de presença ao lado da de ausência, *"sem ela, 'nenhuma escolha some' seria verdade de graça numa lista vazia"* |

---

### 16.12 Escolha e persistência: `Appearance.tsx`

#### 16.12.1 As três chaves

| constante | valor literal | o que guarda | valores válidos |
|---|---|---|---|
| `KEY` | `'appearance.skin'` | a pele | `papel` \| `organico` |
| `HUE_KEY` | `'appearance.hue'` | a paleta da paisagem | `verde` \| `azul` \| `ambar` \| `terracota` \| `lavanda` |
| `SCHEME_KEY` | `'appearance.scheme'` | a luz | `claro` \| `escuro` \| `sistema` |

(`src/theme/Appearance.tsx:8-10`). Os três valores vão para a tabela `app_meta` do SQLite
local, por `readMeta`/`writeMeta` (`src/data/meta.ts:15-31`):

```sql
SELECT value FROM app_meta WHERE key = ?
INSERT INTO app_meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
```

#### 16.12.2 A decisão de fundação: aparelho, não empresa

*"É preferência do APARELHO, não da empresa"* (`src/theme/Appearance.tsx:12-24`). A
diferença importa: o `company_id` manda no que é fato do negócio — se pedido precisa de
aprovação, se o relatório nomeia quem registrou. A cara da tela não é fato do negócio, é de
quem está segurando o celular: *"o dono no escritório e o operador na câmara fria podem
querer coisas diferentes no mesmo dia, e nenhum dos dois está errado."* Por isso mora no
`meta`, que é a gaveta local do aparelho, **e não sobe na fila de sincronização**: trocar a
cara não escreve nada no servidor, não gera movimento e não aparece para mais ninguém.

Os padrões, e de quem é cada decisão:

| preferência | padrão | de quem é a decisão |
|---|---|---|
| pele | `organico` (`src/theme/Appearance.tsx:66`) | do dono — *"foi a identidade que ele apontou primeiro entre as duas"* (`src/theme/Appearance.tsx:26-27`) |
| paisagem | `verde` (`src/theme/Appearance.tsx:67`) | NÃO ESTÁ NO CÓDIGO — o valor está lá, sem justificativa escrita |
| luz | `claro`, via `SCHEME_PADRAO` (`src/theme/Appearance.tsx:68`) | do dono, 4 de setembro (`src/theme/Appearance.tsx:41-43`) |

#### 16.12.3 Leitura, validação e escrita

A leitura é um `Promise.all` dos três `readMeta` num `useEffect` com `[]` de dependências,
com bandeira `cancelled` no `cleanup` (`src/theme/Appearance.tsx:71-91`). Cada valor lido é
**validado antes de entrar no estado**, e um valor inválido é simplesmente ignorado (o
padrão fica):

```ts
if (savedSkin === 'papel' || savedSkin === 'organico') setState(savedSkin);
if (savedHue && (HUES as string[]).includes(savedHue)) setHueState(savedHue as Hue);
if (savedScheme && (SCHEMES as string[]).includes(savedScheme)) setSchemeState(savedScheme as SchemeChoice);
```

(`src/theme/Appearance.tsx:76-80`). `const HUES: Hue[] = ['verde','azul','ambar','terracota','lavanda']`
é uma **segunda lista** dos cinco matizes, escrita em `src/theme/Appearance.tsx:61` — não
deriva de `hues` do arquivo de tokens. `SCHEMES` sim vem de `scheme.ts`.

O `catch(() => undefined)` é justificado: *"A cara é enfeite; falhar a leitura não pode
impedir o aplicativo de abrir. Sem resposta da gaveta, vale o padrão."*
(`src/theme/Appearance.tsx:82-84`).

As três funções de escrita são idênticas em forma (`src/theme/Appearance.tsx:93-108`):
mudam o estado **primeiro** e mandam para o disco depois, sem esperar, engolindo erro —
*"esperar o disco para mudar uma cor faria o toque parecer travado"*
(`src/theme/Appearance.tsx:94-96`).

#### 16.12.4 `ready` — implementado e SEM CHAMADOR

O contexto expõe `ready: boolean` (`src/theme/Appearance.tsx:57-58`), falso até a gaveta
responder, virando verdadeiro no `finally` (`src/theme/Appearance.tsx:85-87`). **Nenhum
componente do repositório lê `ready`** — nem `app/_layout.tsx`, nem `ThemeProvider`, nem
`app/settings.tsx`. Consequência factual: o aplicativo desenha os primeiros quadros com o
padrão (Orgânico, verde, claro) e troca quando o disco responde.

#### 16.12.5 O gancho com padrão em vez de exceção

```ts
export function useAppearance(): Appearance {
  return useContext(AppearanceContext) ?? { skin: 'organico', setSkin: () => undefined,
    hue: 'verde', setHue: () => undefined, scheme: SCHEME_PADRAO, setScheme: () => undefined,
    ready: true };
}
```

(`src/theme/Appearance.tsx:124-136`). Diferente de `useTheme`, que lança. A razão escrita:
fora do provedor — na tela de erro, que sobe antes de tudo — a resposta é o padrão, porque
*"um aplicativo que quebra ao desenhar a tela de quebra não tem como se explicar"*
(`src/theme/Appearance.tsx:117-123`). A mesma escolha é apontada em `src/i18n/Locale.tsx:102`.

#### 16.12.6 Onde os provedores são montados

Em `app/_layout.tsx` a ordem é `GestureHandlerRootView` → `SafeAreaProvider` →
`LocaleProvider` → `AppearanceProvider` → `ThemeProvider` → `ConfirmProvider` → `Stack`
(`app/_layout.tsx:99-126`). O idioma fica **fora** da cara de propósito: *"a escolha da
empresa não muda porque alguém trocou a identidade da tela"* (`app/_layout.tsx:102-104`).

O mesmo trio (`LocaleProvider` → `AppearanceProvider` → `ThemeProvider`) envolve a tela de
quebra nos dois caminhos — o `ErrorBoundary` do Expo Router (`app/_layout.tsx:23-35`) e a
falha de abertura do banco (`app/_layout.tsx:83-95`).

---

### 16.13 `ThemeProvider`: o objeto que a tela lê

#### 16.13.1 O tipo `Theme`, campo a campo

(`src/theme/ThemeProvider.tsx:17-46`)

| campo | tipo | como é calculado | por que existe |
|---|---|---|---|
| `scheme` | `ColorScheme` | `resolveScheme(escolha, useColorScheme())` | qual luz está no ar |
| `color` | `Palette` | `skins[skin][scheme]` | a paleta em uso |
| `palette` | `Palette` | o mesmo objeto que `color` | a paleta inteira, "para quem precisa de um tom que não é o da área" |
| `skin` | `Skin` | do `useAppearance` | qual das duas caras está no ar |
| `brand` | `string` | `skin === 'organico' ? hues[hue].brand : color.apricot` | a cor da identidade |
| `accent` | `string` | `color[area]` | o tom da ÁREA em que a pessoa está |
| `type` | escala tipográfica | `typeBase`, com serifa injetada se `titleFamily` | |
| `space` | `typeof space` | constante, igual nas duas peles | |
| `radius` | `{sm,md,lg,xl,pill}` | `skins[skin].radius` | "os cantos são da identidade" |
| `motion` | `typeof motion` | constante | |

`color` e `palette` são **o mesmo objeto** (`src/theme/ThemeProvider.tsx:89-90`), não duas
paletas: a separação é de intenção de leitura, não de dado.

A distinção `brand` × `accent` está escrita (`src/theme/ThemeProvider.tsx:31-38`): *"a marca
é a escolha; a área é o significado"* — produção é laranja e transporte é roxo, e isso não
muda com o gosto de ninguém.

#### 16.13.2 A injeção da serifa

```ts
const familia = chosen.titleFamily;
const type = familia
  ? { ...typeBase,
      display:      { ...typeBase.display,      fontFamily: familia },
      displaySmall: { ...typeBase.displaySmall, fontFamily: familia },
      section:      { ...typeBase.section,      fontFamily: familia },
      cardTitle:    { ...typeBase.cardTitle,    fontFamily: familia } }
  : typeBase;
```

(`src/theme/ThemeProvider.tsx:76-85`). Exatamente **quatro** escalas recebem a família, e a
regra está escrita: *"A serifa entra só nos títulos, e nunca no corpo nem no número. […]
Corpo em serifa, num celular de fábrica com a tela suja, é o que faz alguém parar de ler — e
o número em serifa perde a figura tabular, que é o que impede a coluna de dançar a cada
atualização"* (`src/theme/ThemeProvider.tsx:70-75`).

**Lacuna factual, medida por contagem de chamadores:** `type.display` e `type.displaySmall`
**não têm um único chamador** em `app/` ou `src/`. O maior título do aplicativo é desenhado
à mão pelo `CollapsingHeader`, que reimplementa as duas escalas como interpolação de rolagem
— `EXPANDED = 34`, `COLLAPSED = 22`, `RANGE = 72`, com
`{ color: color.ink, fontWeight: '600', letterSpacing: -0.8 }` escrito no estilo
(`src/components/CollapsingHeader.tsx:16-18`, `:53-55`, `:82-90`). Os números batem com
`type.display` (34 / -0,8) e `type.displaySmall` (22), mas **`fontFamily` não é aplicado**:
no Papel, o título grande de toda tela **não sai em serifa**. Sobram como destino real da
serifa `section` (5 usos) e `cardTitle` (7 usos).

#### 16.13.3 Memo, e o gancho que não pode ser condicional

O objeto é memoizado com `useMemo(…, [scheme, area, skin, hue])`
(`src/theme/ThemeProvider.tsx:66,101`). `useColorScheme()` é chamado **em toda renderização,
sem condicional**, porque *"gancho de React não pode entrar e sair conforme a escolha"*
(`src/theme/ThemeProvider.tsx:58-63`) — mesmo quando a escolha é `claro` ou `escuro` e a
resposta do aparelho será descartada.

#### 16.13.4 `useTheme` e `AreaProvider`

```ts
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside a ThemeProvider');
  return theme;
}
```

(`src/theme/ThemeProvider.tsx:106-110`). Lança — ao contrário de `useAppearance`.

```ts
export function AreaProvider({ area, children }: { area: Ambient; children: ReactNode }) {
  return <ThemeProvider area={area}>{children}</ThemeProvider>;
}
```

(`src/theme/ThemeProvider.tsx:116-118`), com a regra: *"Screens declare which area they
belong to; every component below picks the accent up from context. No screen ever passes a
color down by hand."* (`src/theme/ThemeProvider.tsx:112-115`).

Consequência estrutural: como `app/_layout.tsx` já monta um `ThemeProvider` (com o padrão
`area = 'sky'`, `src/theme/ThemeProvider.tsx:52`), toda tela com `AreaProvider` monta um
**segundo** `ThemeProvider` aninhado, que sobrescreve o contexto. Vinte e quatro telas fazem
isso; 26 arquivos citam `AreaProvider`.

`useTheme` é consumido por 27 arquivos de `src/components/` e `src/home/` mais as telas
(`src/components/Alive.tsx:13`, `Bars.tsx:11`, `Button.tsx:5`, `Card.tsx:5`, `Chip.tsx:4`,
`CollapsingHeader.tsx:14`, `Confirm.tsx:5`, `CountUp.tsx:3`, `Crash.tsx:5`, `Drain.tsx:10`,
`FactoryScene.tsx:14`, `Field.tsx:2`, `Landscape.tsx:13`, `ListRow.tsx:3`, `Mark.tsx:3`,
`PulseDot.tsx:10`, `Reveal.tsx:9`, `Sky.tsx:11`, `Sparkline.tsx:13`, `Touchable.tsx:4`,
`UnitStepper.tsx:7`, `WhatsNew.tsx:8`, `WhySheet.tsx:7`, `src/home/Mosaic.tsx:26`,
`src/home/Peca.tsx:12`).

---

### 16.14 Tipografia

`export const type` (`src/theme/tokens.ts:140-161`). A escala é **deliberadamente um passo
maior que o padrão de mercado**: *"as pessoas que usam este aplicativo leem numa sala fria,
sob luz ruim, às vezes com a tela suja. Corpo é 17, não os 14-16 de sempre"*
(`src/theme/tokens.ts:135-139`).

| escala | `fontSize` | `lineHeight` | `fontWeight` | `letterSpacing` | serifa no Papel? | usos em `app/` + `src/` |
|---|---|---|---|---|---|---|
| `display` | 34 | 38 | `'600'` | −0,8 | **sim** | **0 — sem chamador** |
| `displaySmall` | 22 | 26 | `'600'` | −0,5 | **sim** | **0 — sem chamador** |
| `section` | 20 | 25 | `'600'` | −0,3 | **sim** | 5 |
| `cardTitle` | 17 | 22 | `'600'` | −0,2 | **sim** | 7 |
| `body` | 17 | 25 | `'400'` | — | não | 66 |
| `secondary` | 15 | 21 | `'400'` | — | não | 67 |
| `figure` | 28 | 32 | `'600'` | −0,7 | não | 26 |
| `hero` | 56 | 58 | `'600'` | −1,5 | não | 1 (`src/components/UnitStepper.tsx:120`) |
| `code` | 13 | 18 | `'500'` | +0,4 | não | 1 (`src/components/Crash.tsx:82`) |
| `caption` | 13 | 18 | `'400'` | — | não | 116 |
| `overline` | 11 | 14 | `'500'` | +1,4 | não | 32 |

Três justificativas escritas nas escalas:

- `figure`: *"Numbers always use tabular figures so columns stop dancing on update"*
  (`src/theme/tokens.ts:147`).
- `hero`: *"Fifty-six points is not decoration: the briefing exists to be answered from the
  doorway, and a cost read at 28 has to be walked up to. One per screen — a second hero is
  two heroes, which is none"* (`src/theme/tokens.ts:149-155`).
- `code`: *"Codes (lot, label) use a monospaced face: 0/O and 1/l must not blur"*
  (`src/theme/tokens.ts:157`). Nota factual: o token define `letterSpacing: 0.4` e **não
  define `fontFamily: 'monospace'`** — a face monoespaçada prometida pelo comentário NÃO
  ESTÁ NO CÓDIGO.

`type.hero` só é usado pelo `UnitStepper`, que por sua vez **não tem chamador**: é
componente da Fase 2, decisão registrada no `CLAUDE.md` e reafirmada em
`src/dictionary.test.ts:45`.

A única tipografia que foge da escala é o rótulo da barra de abas: `fontSize: 12`,
`lineHeight: 16`, `adjustsFontSizeToFit`, `minimumFontScale={0.8}`,
`maxFontSizeMultiplier={1.15}` (`app/(tabs)/_layout.tsx:61-80`). A razão é uma foto do
celular do dono mostrando "Transpo…" e "Relatóri…" a 360 px de largura — *"rótulo cortado
numa barra de navegação é pior que rótulo pequeno: quem lê de luva, com a tela suja,
reconhece a PALAVRA, não o prefixo dela"* (`app/(tabs)/_layout.tsx:37-60`).

---

### 16.15 Espaçamento, raio, elevação, trilho e movimento

#### 16.15.1 Espaçamento

```ts
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;
```

(`src/theme/tokens.ts:163`). **Não muda entre peles.** Usos contados em `app/` + `src/`:
`xs` 73 · `sm` 118 · `md` 98 · `lg` 48 · `xl` 9 · `xxl` 1.

#### 16.15.2 Raio

```ts
export const radius = { sm: 9, md: 14, lg: 19, xl: 24, pill: 999 } as const;
```

(`src/theme/tokens.ts:166`), com o comentário *"Generous corners are the most recognizable
part of the One UI signature"* (`src/theme/tokens.ts:165`).

**Estado: implementado e SEM CHAMADOR.** Nenhum arquivo importa `radius` de
`@/theme/tokens`. O raio que chega à tela vem sempre de `skins[skin].radius` via
`useTheme()` (`src/theme/ThemeProvider.tsx:98`), e as duas peles sobrescrevem **todos** os
valores: Papel 4/6/8/10/999, Orgânico 12/18/22/28/999 (§16.9). Quem reconstruir o produto
pode apagar esta constante sem que um pixel mude.

Usos do raio efetivo: `sm` 3 · `md` 3 · `lg` 1 · `xl` 8 · `pill` 11.

#### 16.15.3 Elevação — NÃO EXISTE

**NÃO ESTÁ NO CÓDIGO.** Não há token de sombra, elevação ou opacidade em
`src/theme/tokens.ts`, e não há uma única ocorrência de `shadowColor`, `shadowOpacity`,
`shadowRadius` ou `elevation:` em `app/` ou `src/`. A profundidade é feita por três coisas,
e só:

1. **As três camadas de fundo da paleta** — `paper` (o chão), `surface` (o cartão),
   `sunken` (o afundado).
2. **As duas réguas** — `line` e `lineStrong`, com `StyleSheet.hairlineWidth` como largura
   padrão do contorno do cartão (`src/components/Card.tsx:181-183`).
3. **Transparência sobre cor sólida**, pela função `tint`:

```ts
export function tint(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(clamped * 255).toString(16).padStart(2, '0')}`;
}
```

(`src/components/Card.tsx:17-20`). Ela mora em `src/components/Card.tsx`, **não** no arquivo
de tokens. A razão escrita: as cores do tema são hexadecimais de seis dígitos, os dois
dígitos a mais são o alfa, e fazer isso aqui em vez de `rgba(...)` na mão *"é o que permite
a mesma linha funcionar nos dois esquemas: o tom sai da paleta, e só a força muda"*
(`src/components/Card.tsx:9-16`).

Os alfas usados no aplicativo inteiro, com o chamador:

| alfa | onde | claro / escuro |
|---|---|---|
| 0,08 / 0,13 | fundo lavado do cartão (`src/components/Card.tsx:94,138`) | 0,08 claro · 0,13 escuro |
| 0,24 / 0,34 | borda do cartão (`src/components/Card.tsx:95,139`) | 0,24 claro · 0,34 escuro |
| 0,14 / 0,22 | crachá do ícone (`src/components/Card.tsx:160`) | 0,14 claro · 0,22 escuro |
| 0,12 e 0,22 | borda e régua da etiqueta de lote (`app/lots/[id].tsx:198,217`) | fixo |
| 0,18 | fundo do `Drain` (`src/components/Drain.tsx:62`) | fixo |
| 0,28 | barras que não são de hoje (`src/components/Bars.tsx:72`) | fixo |
| 0,35 | contorno do ponto final da `Sparkline` (`src/components/Sparkline.tsx:118`) | fixo |
| `22` (hex, ≈0,13) | selo da marca no cabeçalho, escrito como sufixo literal (`src/components/CollapsingHeader.tsx:78`) | fixo |

#### 16.15.4 O trilho

```ts
export const RAIL_WIDTH = 3;
```

(`src/theme/tokens.ts:188`). **Implementado e chamado por um componente**: só
`src/components/Card.tsx:4,142`, e só no ramo do Orgânico —
`borderLeftWidth: toneColor ? RAIL_WIDTH : StyleSheet.hairlineWidth`. No Papel o trilho
esquerdo é zerado e a cor vai para a régua do topo (§16.9.1).

#### 16.15.5 Movimento

```ts
export const motion = {
  settle: { damping: 18, stiffness: 140, mass: 1 },
  press:  { damping: 20, stiffness: 400, mass: 0.6 },
  pressScale: 0.97,
  staggerMs: 40,
  pulseMs: 2600,
  breatheMs: 3200,
  countMs: 1250,
} as const;
```

(`src/theme/tokens.ts:177-185`). *"Spring physics, never linear easing. This is where
'breathing' comes from."* As cinco regras de movimento, transcritas
(`src/theme/tokens.ts:168-176`):

1. Nada pisca. Pulsos duram 2,6–3,2 s.
2. No máximo dois elementos pulsando por tela.
3. Só o que está de fato ao vivo pode pulsar.
4. Movimento nunca atrasa informação.
5. Movimento reduzido desliga tudo, e a tela continua completa.

Usos por chave em `app/` + `src/`: `settle` 7 · `press` 6 · `pressScale` 4 · `staggerMs` 7 ·
`breatheMs` 4 · `countMs` 3 · `pulseMs` 2 (só `src/components/PulseDot.tsx:65,74`).

A regra 5 é implementada nos componentes por `AccessibilityInfo.isReduceMotionEnabled()`,
consultado antes de iniciar qualquer laço — por exemplo `src/components/Landscape.tsx:82-83`
(*"if (cancelado || reduzido) return"*) e `src/components/Sky.tsx:112`. Não há token nem
gancho central para isso.

---

### 16.16 A tela que troca a cara: `app/settings.tsx`

**Implementada e chamada** (`app/settings.tsx`, cartão `Reveal index={1}`, linhas 533-646).
O cartão usa `hue={palette.mist}` — a cor da área de ajustes — e o ícone
`GlyphSettings size={26} weight={traco}` (`app/settings.tsx:534-537`).

Três controles, nesta ordem:

| bloco | controle | valores | linhas |
|---|---|---|---|
| A luz da tela | três `Button` lado a lado, `flex: 1` cada, `variant` = `primary` no escolhido e `ghost` nos outros | `claro` · `escuro` · `sistema` | `app/settings.tsx:543-567` |
| A cara | dois `Button` com legenda embaixo em `caption`, tinta `inkMuted` no escolhido e `inkFaint` nos outros | `organico` · `papel` | `app/settings.tsx:569-596` |
| A cor da paisagem | cinco `Pressable` com `accessibilityRole="radio"`, disco de cor e nome | `verde` `azul` `ambar` `terracota` `lavanda` | `app/settings.tsx:606-645` |

O terceiro bloco **só existe quando `skin === 'organico'`** (`app/settings.tsx:606`, `:645`):
*"O Papel tem uma cara só, que é a graça dele: revista impressa não vem em cinco cores de
capa"* (`app/settings.tsx:598-600`).

O disco escolhido tem 44×44 e os outros 30×30, com `borderRadius: 22` fixo e
`backgroundColor: hues[qual].brand`; o nome fica em `color.ink` quando escolhido e
`color.inkFaint` quando não (`app/settings.tsx:626-639`). A decisão escrita: *"O que marca a
escolhida é o tamanho e o nome em tinta cheia — anel desenhado à mão seria mais uma caixa"*
(`app/settings.tsx:602-605`).

Textos, nos três idiomas (chaves sob `t.app.settings.appearance`):

| chave | pt-BR (`src/i18n/locales/pt-BR.ts`) | en (`src/i18n/locales/en.ts`) | es (`src/i18n/locales/es.ts`) |
|---|---|---|---|
| `label` | A cara do aplicativo | How the app looks | La cara de la aplicación |
| `hint` | Duas identidades e três luzes. É escolha deste aparelho — não muda nada para mais ninguém. | Two identities and three lights. This phone chooses — nothing changes for anyone else. | Dos identidades y tres luces. Es la elección de este teléfono — no cambia nada para nadie más. |
| `lightLabel` | A luz da tela | Screen light | La luz de la pantalla |
| `lightHint` | O padrão é o claro. Escolha o escuro para a câmara fria, ou deixe o aparelho decidir. | Light is the default. Pick dark for the cold room, or let the phone decide. | El claro es lo normal. Elige el oscuro para la cámara fría, o deja que el teléfono decida. |
| `light` | Claro | Light | Claro |
| `dark` | Escuro | Dark | Oscuro |
| `system` | Seguir o aparelho | Follow the phone | Seguir el teléfono |
| `papel` | Papel | Paper | Papel |
| `papelHint` | serifa, traço fino, cantos retos | serif, thin line, sharp corners | serifa, trazo fino, esquinas rectas |
| `organico` | Orgânico | Organic | Orgánico |
| `organicoHint` | paisagem, curva, cantos macios | landscape, curve, soft corners | paisaje, curva, esquinas suaves |
| `palette` | A cor da paisagem | The colour of the landscape | El color del paisaje |
| `paletteHint` | Muda o céu e a colina. Os sinais de alta e de queda não mudam — eles são leitura, não enfeite. | Changes the sky and the hill. The up and down signals stay put — they are reading, not decoration. | Cambia el cielo y la colina. Las señales de subida y bajada no cambian — son lectura, no adorno. |
| `hues.verde` | Verde | Green | Verde |
| `hues.azul` | Azul | Blue | Azul |
| `hues.ambar` | Âmbar | Amber | Ámbar |
| `hues.terracota` | Terracota | Terracotta | Terracota |
| `hues.lavanda` | Lavanda | Lavender | Lavanda |

Linhas: `src/i18n/locales/pt-BR.ts:419-440`, `src/i18n/locales/en.ts:370-391`,
`src/i18n/locales/es.ts:375-396`.

---

### 16.17 O que o navegador prova (e2e)

Duas checagens em `e2e/flow.mjs`, **implementadas e rodando** (`npm run e2e:fast`).

#### 16.17.1 `the app has two faces, and the choice survives leaving the screen`

(`e2e/flow.mjs:1713-1752`). Abre `/settings`, confere que "A cara do aplicativo", "Orgânico"
e "Papel" estão na tela, clica em **Papel**, navega para `/` e volta para `/settings`, e
então afirma três coisas: os ajustes continuam de pé, a tela desenhou com alguma cor de
fundo, e **"A cor da paisagem" não aparece** — *"o Papel não tem paleta para escolher"*.
Depois clica em **Orgânico** e afirma que "A cor da paisagem" e "Terracota" voltam.

#### 16.17.2 `the app opens light even on a phone set to dark, and the light is switchable`

(`e2e/flow.mjs:1754-1838`). Esta é a checagem que fecha o defeito relatado pelo dono. O
navegador é posto em `colorScheme: 'dark'` (`e2e/flow.mjs:1758`) e a medida é a **luminância
do maior elemento opaco da página**, calculada com `0.2126 R + 0.7152 G + 0.0722 B` sobre
0–255 (`e2e/flow.mjs:1775-1801`):

| passo | asserção |
|---|---|
| abertura, aparelho no escuro | luminância **> 0,6** — abre claro |
| a tela mostra as três opções | casa "A luz da tela", "Claro", "Escuro", "Seguir o aparelho" |
| clicar em **Escuro** | luminância **< 0,3** |
| sair para `/` e voltar | continua **< 0,3** — a escolha está na gaveta, não no estado |
| clicar em **Claro** | volta a **> 0,6**, com o aparelho ainda no escuro |
| clicar em **Seguir o aparelho** | **< 0,3** |

Duas cicatrizes escritas na própria medida, e as duas são sobre teste que passa pelo motivo
errado (`e2e/flow.mjs:1765-1798`): (1) a primeira versão lia `document.body`, que é
transparente aqui — a luminância dava 0,00 nos dois temas; (2) o React Native Web põe uma
chapa cinza fixa `rgb(242,242,242)` do tamanho exato da janela, e a chapa do aplicativo tem
a **mesma área** — com `>` ficava a primeira em ordem de documento, a medida dava 0,95 nos
dois temas e *"a asserção de 'abre claro' passava pelo motivo errado, medindo uma coisa que
nunca muda"*. O desempate virou `>=`, que escolhe quem está por cima.

#### 16.17.3 A ferramenta de fotografar

`scripts/shot.mjs` fotografa **quatro combinações** — `['organico','papel']` ×
`['light','dark']` (`scripts/shot.mjs:112,181`), e o nome do arquivo carrega as duas
(`scripts/shot.mjs:304`). A troca é feita **dentro do aplicativo**, clicando nos botões dos
ajustes, e não por `colorScheme` do navegador (`scripts/shot.mjs:268-279`) — porque no dia
em que a luz virou escolha com padrão claro, *"a foto do escuro saía IGUAL à do claro, e eu
teria olhado duas vezes a mesma tela dizendo que vi as duas"* (`scripts/shot.mjs:260-267`).

---

### 16.18 Quadro de estado — o que tem chamador e o que não tem

| símbolo | arquivo:linha | estado |
|---|---|---|
| `ambient` (tupla) | `src/theme/tokens.ts:21` | **implementado, sem chamador** |
| `Ambient` (tipo) | `src/theme/tokens.ts:32` | implementado e usado (`app/(tabs)/_layout.tsx:12,84`, `ThemeProvider`) |
| `ambientArea` | `src/theme/tokens.ts:35` | **implementado, sem chamador** |
| `palettes` | `src/theme/tokens.ts:131` | **implementado, sem chamador** (mas medido pelo teste de contraste) |
| `lightPalette` / `darkPalette` | `src/theme/tokens.ts:74,105` | **não pintam nenhuma tela**; entram na régua de contraste |
| `Palette` (tipo) | `src/theme/tokens.ts:132` | usado (`ThemeProvider`, `src/components/Sky.tsx:12`) |
| `ColorScheme` (tipo) | `src/theme/tokens.ts:133` | usado (`scheme.ts`, `ThemeProvider`) |
| `type` (escala) | `src/theme/tokens.ts:140` | usado via `useTheme` |
| `type.display` / `type.displaySmall` | `src/theme/tokens.ts:141,142` | **implementados, sem chamador** — reimplementados à mão em `CollapsingHeader` |
| `type.hero` | `src/theme/tokens.ts:156` | um chamador só, e ele mesmo sem chamador (`UnitStepper`, Fase 2) |
| `space` | `src/theme/tokens.ts:163` | usado via `useTheme` |
| `radius` (topo do arquivo) | `src/theme/tokens.ts:166` | **implementado, sem chamador** — sobrescrito pelas duas peles |
| `motion` | `src/theme/tokens.ts:177` | usado via `useTheme` (todas as sete chaves têm chamador) |
| `RAIL_WIDTH` | `src/theme/tokens.ts:188` | usado por um componente (`src/components/Card.tsx:142`) |
| `Skin` (tipo) | `src/theme/tokens.ts:206` | usado (`Appearance`, `Sky`) |
| `Hue` (tipo) | `src/theme/tokens.ts:376` | usado (`Appearance`) |
| `hues` | `src/theme/tokens.ts:378` | usado por duas telas (`app/settings.tsx:631`, `src/components/Landscape.tsx:70`) |
| `skins` | `src/theme/tokens.ts:386` | usado só pelo `ThemeProvider` |
| `SchemeChoice` / `SCHEMES` / `SCHEME_PADRAO` / `resolveScheme` | `src/theme/scheme.ts:25,28,38,50` | usados e testados |
| `Appearance.ready` | `src/theme/Appearance.tsx:57` | **implementado, sem chamador** |
| `contraste` (exportada do teste) | `src/theme/contrast.test.ts:41` | **exportada, sem importador externo** |
| `tint` | `src/components/Card.tsx:17` | usado por 6 arquivos |

Nada neste sistema está **planejado/comentado apenas**: todo item citado existe como código.

---

### 16.19 Lacunas e coisas que NÃO estão no código

- **Não há elevação/sombra.** Nenhum token, nenhum uso. §16.15.3.
- **`type.code` não declara `fontFamily: 'monospace'`**, embora o comentário prometa face
  monoespaçada (`src/theme/tokens.ts:157-158`).
- **A serifa do Papel não alcança o título grande de nenhuma tela**, porque
  `CollapsingHeader` não usa `type.display`/`type.displaySmall`. §16.13.2.
- **A espessura do traço dos ícones (1,7 / 2,2) não é token** — está duplicada em 26
  arquivos. §16.9.1.
- **A lista de matizes existe duas vezes**: `hues` (tokens) e `HUES` (`src/theme/Appearance.tsx:61`),
  sem derivação entre as duas.
- **Nenhum teste mede contraste de cor ambiente, de sinal ou de `onAccent` sobre
  preenchimento.** A régua cobre só tinta × fundo. §16.5.4.
- **O padrão `verde` da paisagem não tem justificativa escrita** — ao contrário dos outros
  dois padrões, que citam o dono e a data.
- **`ready` não gera espera**: o app desenha com o padrão até a gaveta responder. §16.12.4.
- **O docblock de `contrast.test.ts` descreve um espalhamento (`...`) que não existe mais**
  no arquivo de tokens. §16.8.1.
- **Nível de evidência do sistema de tema:** E3 — as três guardas unitárias e as duas
  checagens de navegador rodam de verdade (`npx tsx --test src/theme/contrast.test.ts` →
  3/3 passando), e as telas foram fotografadas nas quatro combinações
  (`docs/roadmap.md:51-54`). **Nada visto numa fábrica.**
