## 32. A investigação de design: os esboços e a linguagem visual

### 32.1 Por que a investigação existiu

O dono recusou a capa **três vezes** — *"está feio ainda"*, *"não acerta a
mão"* — e então pediu o que faltava: **dez identidades diferentes, para ver por
onde caminhar** (`docs/esbocos/README.md:1-4`). A data da primeira rodada é
**2 de setembro** (`docs/esbocos/README.md:1`).

O diagnóstico escrito não é de gosto, é de método: as três primeiras rodadas
tinham a mesma forma — *"eu escolhia uma direção, construía em React Native,
mostrava, ele recusava. Cada tentativa custava horas e voltava uma frase —
'melhorou, mas sei lá'. Isso não é iteração, é adivinha cara"*
(`docs/insights.md:1773-1777`). Entre a terceira e a quarta rodada o que mudou
foi **quem decide** e **quanto custa cada tentativa**
(`docs/insights.md:1770-1772`).

Quatro regras saíram disso, e estão escritas (`docs/insights.md:1780-1794`):

1. **Esboço em HTML, não no aplicativo.** A pergunta era de linguagem visual —
   raio, densidade, escala tipográfica, onde a cor entra. Ela se responde em
   vinte minutos por lote em HTML contra horas por tentativa em React Native.
   *"Dez esboços custaram menos que a segunda tentativa em código"*
   (`docs/insights.md:1780-1783`).
2. **Dez opções em vez de uma defesa.** Com uma, ele só podia aprovar ou
   recusar; com dez, ele escolheu cinco, depois três, depois duas — *"e cada
   corte dele me disse mais do que qualquer explicação minha teria dito"*
   (`docs/insights.md:1784-1787`).
3. **A correção dele vale mais que a minha leitura dela.** Quando disse *"quero
   mais contraste, está apagado"*, a leitura foi "cor em mais lugares" e a
   entrega foram três degraus de mais cor. Errado: era **saturação**, não
   quantidade (`docs/insights.md:1788-1791`).
4. **Parte do que ele recusou era acerto que não era acerto.** O selo de ícone
   cheio parecia melhoria e brigava com a ilustração monoline do topo
   (`docs/insights.md:1792-1794`).

A regra generalizada: *"quando a decisão é de gosto do dono — marca, cara, tom —
o meu trabalho não é escolher bem: é **fazer a escolha dele ser barata**. Muitas
opções, rápidas, comparáveis, com o mesmo dado"* (`docs/insights.md:1796-1801`).
E o desdobramento que o dono acrescentou: *"a gente poderia dar várias opções
desses elementos para a pessoa configurar a tela inicial dela"*
(`docs/insights.md:1802-1805`) — que é a capa configurável.

O contrato de descarte estava escrito desde o começo: *"O que for escolhido vira
código de verdade; **os outros nove são apagados**, junto com esta pasta"*
(`docs/esbocos/README.md:9-10`). A pasta **não foi apagada** — os 40 arquivos
seguem no repositório na data deste dossiê.

Por que os esboços entraram no repositório em vez de ficar num diretório
temporário: *"sessão acaba e contexto se perde: o dono está escolhendo entre
eles, e um esboço que só existe no meu diretório temporário não sobrevive até a
resposta"* (mensagem do commit `aa6a76b`).

---

### 32.2 O briefing: o contrato dado aos desenhistas

`docs/esbocos/_briefing.md` é o arquivo que os cinco desenhistas da segunda
rodada receberam (`docs/esbocos/README.md:75`). Transcrição integral das regras.

#### Escopo e restrições técnicas

Você desenha **UMA** tela: a capa (briefing) do NORVA, sistema de uma fábrica de
picolés. **Arquivo HTML único, sem JS, sem rede, sem fonte externa** — *"a
máquina que fotografa não tem internet (Google Fonts NÃO carrega). Só CSS e SVG
inline"* (`docs/esbocos/_briefing.md:3-5`).

#### Tamanho e forma (`docs/esbocos/_briefing.md:7-11`)

| regra | valor |
|---|---|
| corpo | `body { width: 412px; min-height: 915px; }` — é um celular |
| barra de abas | fixa embaixo, **78px** de altura, e **tem os ícones de verdade** (snippet em `_tabbar.html`, "cole e ajuste só as cores") |
| respiro no fim do conteúdo | **~110px**, para a barra não cobrir nada |

#### O dado, que é sempre o mesmo e não se inventa outro (`docs/esbocos/_briefing.md:13-22`)

| campo | valor exato |
|---|---|
| produção de hoje | **500 unidades** |
| ontem | **478** |
| contra a quarta passada | **+19** |
| semana (7 colunas, da mais velha para hoje, altura relativa) | 38% · 44% · 41% · **6%** · 82% · 46% · **64% (hoje)** |
| rótulos dos dias | `Q S S D S T Q` — ou `qui sex sáb dom seg ter qua` |
| insumo acabando | **Polpa de morango, acaba em 1 dia** |
| expedição | **1 caixa saiu hoje** |
| preços que mexeram | Polpa de morango ▼0,6% · Açúcar cristal ▼2,2% · Glucose 38DE ▲0,9% |
| clima | **São Paulo: 21°**, mínima **13°**, **47% de chance de chuva**, amanhã **+4°** |
| data | quarta-feira, **2 de setembro** |
| marca | **NORVA** |

Esse dado não é inventado: é o que a fábrica de exemplo produz depois de
"plantar duas semanas" (`docs/esbocos/README.md:12-15`).

**A regra do dado foi violada na primeira rodada, em seis dos dez arquivos.** O
domingo está desenhado a **8%** em `01-aurora.html:39`, `04-vitrine.html:27`,
`05-vidro.html:35`, `07-brinquedo.html:30`, `08-organico.html:37` e
`10-galeria.html:36`, contra os **6%** do briefing. Os três que acertaram foram
`02-papel.html:30`, `06-suico.html:28` e `09-terminal.html:34`. Todos os quinze
da segunda rodada e os doze da terceira usam 6% (ou uma forma derivada dele).

#### Regras que não se quebram (`docs/esbocos/_briefing.md:24-30`)

- **Nada de botão "Lançar produção" na capa** — *"o dono mandou tirar; a aba
  Produção já é essa porta"*. Esta regra **nasceu da primeira rodada**: os dez
  primeiros esboços TÊM o botão (`01`…`10`, todos com um `.cta` fixo em
  `bottom:96px`), e nenhum dos trinta seguintes tem.
- **O clima aparece em TODAS as telas, com destaque próprio.**
- **Todo número tem sua comparação do lado** (500 nunca aparece sozinho).
- **Nada de foto:** o que parecer imagem é desenhado em SVG/CSS.
- **Português do Brasil, tom curto e direto.**

A justificativa do "nada de foto" está escrita à parte: *"este aplicativo abre
offline, dentro de uma câmara fria, num celular que a fábrica comprou barato.
Foto é peso que não carrega e não aparece. Tudo o que parece imagem aqui é
desenhado em código — onda, sol, nuvem, degradê — e por isso atravessa para o
React Native sem biblioteca nova"* (`docs/esbocos/README.md:30-34`).

#### O que o dono pediu explicitamente (`docs/esbocos/_briefing.md:32-37`)

- **Mais ícones e imagens na tela** — *"foi a crítica principal"*.
- **Menos monocromático** onde a família for escura/neutra.
- Que cada variante seja **claramente diferente das outras duas** da mesma
  família: *"não mude só a cor, mude a ESTRUTURA (o que é grande, o que divide
  linha, o que vira lista, o que vira bloco)"*.

#### O que os esboços declaradamente não conseguem mostrar (`docs/esbocos/README.md:36-39`)

Movimento e ligação entre telas: o cartão que entra escalonado, o número que
afunda quando o dedo encosta, e a transição em que tocar o número do dia *vira* a
tela de produção com o mesmo número no lugar. *"Isso é código, e é a primeira
coisa depois da escolha."*

---

### 32.3 `_tabbar.html` — a peça compartilhada

25 linhas, HTML + CSS inline, sem JS (`docs/esbocos/_tabbar.html`). Comentário de
abertura: *"Barra de abas com os ícones do app. Troque apenas as cores nas
variáveis"* (`_tabbar.html:1`).

CSS (`_tabbar.html:2-8`):

```css
.tabbar{position:fixed;bottom:0;left:0;right:0;height:78px;display:flex;align-items:center;
 justify-content:space-around;padding-bottom:14px;font-size:11px;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.tabbar a{display:flex;flex-direction:column;align-items:center;gap:5px;text-decoration:none}
.tabbar svg{display:block}
```

As cinco variáveis CSS com os padrões (`_tabbar.html:9-23`):

| variável | padrão | função |
|---|---|---|
| `--tabbg` | `#101014` | fundo da barra |
| `--tabline` | `#23232b` | filete de topo (1px) |
| `--tabink` | `#6d6d78` | rótulo apagado |
| `--tabon` | `#8fb6d8` | ícone e rótulo da aba ativa |
| `--c2` | `#e2a283` | cor do ícone de Produção |
| `--c3` | `#ab9bdd` | cor do ícone de Transporte |
| `--c4` | `#d9b76a` | cor do ícone de Relatórios |
| `--c5` | `#a8a39b` | cor do ícone de Mais |

Os cinco traçados SVG, todos em grade de 24, `stroke-width="1.6"`,
`fill="none"`, `stroke="currentColor"` (`_tabbar.html:11-23`):

| aba | traçado |
|---|---|
| **Início** | `M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z` (casa) |
| **Produção** | `<rect x="6" y="2.5" width="12" height="14" rx="6"/>` + `M12 16.5v5` (**picolé** — corpo arredondado e palito) |
| **Transporte** | `M2 7.5h11v9H2z` + `M13 11h4l3.5 3.5v2H13z` + `circle cx=6.5 cy=18.5 r=1.9` + `circle cx=16.5 cy=18.5 r=1.9` (caminhão) |
| **Relatórios** | `M4 20h16` + `M6.5 20v-6` + `M12 20V5` + `M17.5 20v-9` (barras na linha de base) |
| **Mais** | quatro `rect` 7×7 `rx=2` em `3.5/13.5` × `3.5/13.5` (grade 2×2) |

A aba ativa é sempre **Início**, com `font-weight:600` no rótulo.

Os quinze da segunda rodada colaram este arquivo literalmente (a marca do
comentário `<!-- Barra de abas com os ícones do app... -->` aparece em
`11-papel-a.html:162`, `12-papel-b.html:162`, `13-papel-c.html:136`, etc.). Os
três Suíços (`17`, `18`, `19`) e os três Terminais (`23`, `24`, `25`) fizeram o
mesmo com paletas próprias. Três esboços reescreveram a barra à mão em vez de
usar as variáveis: `20-organico-a.html:251-267`, `21-organico-b.html:224-240` e
`22-organico-c.html:243-259`, cada um com cinco cores literais.

---

### 32.4 Primeira rodada — dez identidades (2 de setembro, commit `aa6a76b`)

Tabela oficial, transcrita de `docs/esbocos/README.md:17-28`:

| # | identidade | de onde vem |
|---|---|---|
| 01 | Aurora | escuro com brilho e degradê; painéis de vidro sobre luz |
| 02 | Papel | editorial, serifa, régua fina, muito branco |
| 03 | Anéis | anel de progresso, número grande, cartão colorido |
| 04 | Vitrine | capa colorida de altura inteira, cartões macios com sombra |
| 05 | Vidro | painéis foscos sobre fundo de manchas coloridas |
| 06 | Suíço | tipografia dura, régua grossa, um acento vermelho |
| 07 | Brinquedo | cor chapada, sombra dura, emoji, cara de jogo |
| 08 | Orgânico | onda, sol, verde; nada alinhado na mesma grade |
| 09 | Terminal | monoespaçado, verde de tela, números densos |
| 10 | Galeria | cartões altos que deslizam de lado, cara de streaming |

#### O que era comum às dez

- Todas referenciam `<link rel="stylesheet" href="_base.css">` na linha 1 — e
  **`_base.css` NÃO EXISTE no repositório**, nem existiu em commit nenhum
  (`git log --all -- docs/esbocos/_base.css` não devolve nada). Os dez esboços
  usam classes que só esse arquivo definiria: `.sf`, `.serif`, `.mono`, `.tab`.
  Consequência para quem reconstruir: **abrir 01 a 10 hoje mostra a tela sem a
  tipografia e com a barra de abas desformatada**.
- Todas terminam com um `.cta` fixo — o botão **"Lançar produção"** — e com uma
  `.tab` **de texto puro, sem ícone**: `<div class="tab sf"><b>Início</b>
  <span>Produção</span><span>Transporte</span><span>Relatórios</span>
  <span>Mais</span></div>`. Esses são os dois defeitos que a segunda rodada
  corrigiu.
- Nenhuma usa foto; tudo o que parece imagem é SVG/CSS.

#### 01 — Aurora (`01-aurora.html`, 64 linhas)

Fundo `#08090c`; dois discos `.glow` desfocados a 70px de raio e `opacity:.55` —
um `#4b5bd6` de 320px no canto superior esquerdo e um `#a259c9` de 260px à
direita (`01-aurora.html:32-33`). O número do dia em **86px, peso 700,
`letter-spacing:-.045em`**, pintado com `background:linear-gradient(160deg,#fff
20%,#8ea2ff 90%)` e `background-clip:text` (`01-aurora.html:9-10`). Sparkline de
sete colunas com `border-radius:4px 4px 2px 2px` e degradê; a de hoje ganha
`box-shadow:0 0 18px #5b6bd6aa` (`01-aurora.html:13-14`). Grade 1fr/1fr de
cartões de vidro (`#ffffff12` de borda, `backdrop-filter:blur(8px)`,
`border-radius:20px`). Clima com sol em `radialGradient` `#ffd98a`→`#ff9f5a`. O
CTA é uma pílula `border-radius:999px` com degradê `#6d7cf0`→`#a06ef0` e
`box-shadow:0 12px 40px #6d7cf055`. Preços em três linhas `space-between`, verde
`#7ee0a8` para queda e âmbar `#ffc06a` para alta.
**Defeito no arquivo:** a linha 20 contém CSS corrompido —
`.k{font-size:10px;letter-spacing:.14em;color:#7d melhores}` — um valor de cor
inválido literal (`01-aurora.html:20`). A classe `.k` não é usada no corpo.

#### 02 — Papel (`02-papel.html`, 50 linhas)

**A origem da família vencedora.** Fundo `#faf7f2`, tinta `#221f1b`. Kicker em
11px, `letter-spacing:.22em`, caixa alta, `#a2988a`. `h1` em **34px, peso 400,
`line-height:1.05`**, com `<b>` em 700 — a manchete é *"Hoje a fábrica / **fez
500 unidades**"* (`02-papel.html:29`). Régua de 1px `#e2dbd0`. Barras
`border-radius:2px`, trilha `#ded5c7`, hoje `#b4552d`. Cartão de clima com
`border:1px solid #e2dbd0`, `border-radius:4px`, fundo branco e um **sol em
traço** (círculo `r=13`, `stroke-width:1.4`, oito raios) — a decisão de "cor em
traço, nunca em massa" já está aqui (`02-papel.html:34-37`). Três linhas de lista
com `border-bottom:1px solid #eee8de`, sem ícone. CTA preto chapado (`#221f1b`)
de canto reto.

#### 03 — Anéis (`03-aneis.html`, 62 linhas)

Preto puro (`#000`). Dois anéis concêntricos de 150px: externo `r=62`,
`stroke-width=16`, `stroke-dasharray="389" stroke-dashoffset="82"`, degradê
`#ff9f0a`→`#ff375f`; interno `r=42`, `dasharray="264" dashoffset="106"`, degradê
`#30d158`→`#00c7be`, ambos com `transform="rotate(-90 75 75)"`
(`03-aneis.html:27-38`). Ao lado, três estatísticas empilhadas em 34px/700: 500
"unidades hoje", 478 "ontem", +19 "vs. quarta passada". Pílulas `#1c1c1e` com
`border-radius:18px`. Cartão de clima com degradê diagonal
`#0a3d62`→`#1e6091`→`#f6b26b` e um disco `#ffd98a` de `opacity:.35` sangrando
pelo canto. **Não tem gráfico de semana.**

#### 04 — Vitrine (`04-vitrine.html`, 51 linhas)

Herói de **290px** de altura com `border-radius:0 0 32px 32px` e degradê
`#ffd3a5`→`#fd9d6e`→`#f36f6f` (`04-vitrine.html:4-5`). Dentro do herói, as
barras da semana em branco a `opacity:.55`, com a de hoje em `opacity:1`
(`04-vitrine.html:23-24,27`). Número em 72px/800. Abaixo, seções tituladas ("O
tempo lá fora", "Precisa de você", "Mudou de preço") e cartões
`border-radius:22px`, `box-shadow:0 6px 24px #0000000f`, com **crachá de ícone
52×52 `border-radius:16px`** em pastel: `#fff2e0` para o insumo, `#eef0ff` para a
expedição, `#e9f9ef` para o preço. Os ícones são de duas camadas — massa
preenchida em `opacity:.25`–`.3` mais traço de 2,2 — que é exatamente a receita
que a família `Glyph*` do aplicativo adotou depois.

#### 05 — Vidro (`05-vidro.html`, 56 linhas)

Fundo `#0f1220` com três `radial-gradient` de 55% de opacidade fixos em
`inset:0`: azul `#5b7cfa` a 10%/5%, rosa `#f07099` a 95%/25%, verde `#37d9a3` a
50%/90% (`05-vidro.html:4-7`). Painéis `.g`: `background:#ffffff14`,
`border:1px solid #ffffff22`, `border-radius:26px`, `backdrop-filter:blur(22px)`,
`box-shadow:0 8px 32px #00000040`. Número 64px/700. Barras `border-radius:5px`
em `#ffffff2e`, hoje em branco puro. CTA branco de canto 22px.

#### 06 — Suíço (`06-suico.html`, 43 linhas)

Fundo `#f2f2ef`, tinta `#111`, **um único acento vermelho `#e2340a`**. Régua de
topo de **3px** sólida. Número em **104px, peso 800, `letter-spacing:-.06em`,
`line-height:.85`** (`06-suico.html:7`). Sete colunas em `grid` com `gap:4px`,
barras retas sem raio. Tabela HTML de verdade (`<table>` com `border-collapse`),
cada `td` com `border-bottom:1px solid #111`, valores em `td.r` alinhados à
direita e em peso 700, tudo em CAIXA ALTA. Cartão de clima com
`border:3px solid #111` e a temperatura em 58px/800. Barra de abas com
`border-top:3px solid #111`, texto em 10px caixa alta.

#### 07 — Brinquedo (`07-brinquedo.html`, 44 linhas)

Fundo `#fff6e9`. Quatro cartões de cor **chapada** — `.c1 #ffb02e`,
`.c2 #7bd389`, `.c3 #7cc6fe`, `.c4 #ff8fa3` — com `border-radius:28px` e
**sombra dura** `box-shadow:0 6px 0 rgba(0,0,0,.12)` (`07-brinquedo.html:9-10`).
Números em **60px, peso 900**, brancos, com `text-shadow:0 3px 0
rgba(0,0,0,.12)`. **É o único dos quarenta esboços que usa emoji**: 🍦 no avatar,
🏭 🏭 ⛅ 🍓 📦 nos cartões e 🍧 no CTA (`07-brinquedo.html:24,26,33,39,40,43`).
Saudação personalizada: *"Bom dia, chefe!"*.

#### 08 — Orgânico (`08-organico.html`, 56 linhas)

**A origem da segunda família vencedora.** Topo de **330px** com um SVG em
`preserveAspectRatio="none"`: um degradê `#a8e0c0`→`#7bc9a6` cortado por duas
ondas (`M0 0h412v226c-70 34-120-14-206 8S64 300 0 262z` e uma camada branca a
`#ffffff30`), mais um sol `circle cx=336 cy=74 r=34 fill="#fff3c4"`
(`08-organico.html:27-32`). O conteúdo sobe **-46px** por cima da cena
(`margin-top:-46px`) em cartões `.blob` com raio assimétrico
**`38px 38px 30px 30px`** e `box-shadow:0 10px 40px #0000000d`
(`08-organico.html:10-11`). Os crachás de linha são `.dot` 44×44 com
`border-radius:50% 50% 46% 54%/50% 46% 54% 50%` — **um blob, não um círculo**
(`08-organico.html:14`). Barras com `border-radius:8px 8px 5px 5px` em `#dfe7e0`,
hoje `#3f7d5c`. Clima em cartão de raio 34px com degradê `#cfe8ff`→`#eaf6ff`.
CTA pílula verde `#3f7d5c` com `box-shadow:0 10px 26px #3f7d5c44`.

#### 09 — Terminal (`09-terminal.html`, 57 linhas)

Fundo `#0c0f0d`, tinta `#d7e3da`, acento `#48d597`, aviso `#f0b429`. Blocos
`.blk` com `border:1px solid #1d2a22`, `border-radius:10px` e fundo `#0f1512`.
Número 56px/600 em `#e9fff2`, unidade em `<em>` com `letter-spacing:.1em`. Barras
de 3px de gap, sem raio, hoje com `box-shadow:0 0 12px #48d59766`. Rótulos em
10px com `letter-spacing:.18em` caixa alta. **Precisão numérica maior que a dos
outros:** `21,0°`, `mín 13,0°`, `pp 47%`, `Δ amanhã +4,0°`, `+19 (+3,9%)`, e uma
quarta linha de preço que os outros não têm (`LEITE EM PÓ ▼ 0,3%`) —
`09-terminal.html:33,39-40,52`. Tabela com
`font-variant-numeric: tabular-nums`. CTA de contorno (`border:1px solid
#48d597`, fundo `#0f1512`), texto em caixa baixa e `letter-spacing:.14em`. Os
rótulos de aba são abreviados: `Prod`, `Transp`, `Relat`.

#### 10 — Galeria (`10-galeria.html`, 56 linhas)

Fundo `#101014`. Uma faixa horizontal (`.strip`, `overflow:hidden`) de dois
cartões **altos** 238×320 com `border-radius:26px`: `.t1` degradê
`#2b1c4a`→`#7a4fd8` para a produção e `.t2` `#0d3b4f`→`#2e9bbd` para o clima, com
uma camada `.art` de círculos a `opacity:.45` atrás (`10-galeria.html:9-15`).
Números em 58px/750. Abaixo, lista de itens `#191920` com `border-radius:18px` e
crachá 48×48 `border-radius:14px` de fundo escuro tingido (`#3a2a16`, `#21203a`,
`#12301f`).

---

### 32.5 O corte do dono e a segunda rodada — quinze variantes (commit `f41c875`)

O dono eliminou metade e ficou com **2 (Papel), 5 (Vidro), 6 (Suíço), 8
(Orgânico) e 9 (Terminal)** (`docs/esbocos/README.md:44-45`). As três observações
que valeram para todas as variantes (`docs/esbocos/README.md:46-47`):

- *"seria bom se tivesse mais ícones/imagens na tela"*;
- *"sem ser tão monocromático"* — sobre o 6 e o 9;
- *"o 8, se trabalhar mais, fica bom"*.

**E uma pergunta que era um defeito do lado de quem desenhou:** *"por que você
removeu os ícones?"*. A resposta escrita: *"Não removi do aplicativo — a barra de
abas está intacta. O que estava sem ícone era o **esboço**: naquela primeira
rodada a barra era só texto"* (`docs/esbocos/README.md:49-53`). Os quinze desta
rodada carregam os ícones de verdade, *"extraídos de `src/components/icons.tsx`
e guardados em `_tabbar.html`"*.

A regra da rodada era mudar a **estrutura**, não só a cor
(`docs/esbocos/README.md:55`). Tabela transcrita de
`docs/esbocos/README.md:57-73`:

| # | família | o que muda |
|---|---|---|
| 11 | Papel | ilustração de fábrica em traço fino, ícone em cada linha |
| 12 | Papel | duas colunas de jornal, capitular, fio vertical |
| 13 | Papel | blocos de cor chapada, cara de revista dos anos 70 |
| 14 | Vidro | o fundo vira sol e onda desfocados; ícone marca-d'água por painel |
| 15 | Vidro | mosaico de peças de tamanhos diferentes |
| 16 | Vidro | a mesma identidade em modo dia |
| 17 | Suíço | pictograma geométrico em cinco cores |
| 18 | Suíço | cartaz de faixas chapadas |
| 19 | Suíço | infográfico com a conta aberta e termômetro desenhado |
| 20 | Orgânico | cena com sol, chuva e a fábrica ao longe |
| 21 | Orgânico | paleta de fruta; a semana vira bolhas |
| 22 | Orgânico | a identidade à noite |
| 23 | Terminal | uma cor por tipo de dado, gráfico de área |
| 24 | Terminal | instrumentos desenhados: ponteiro, tanque de nível, odômetro |
| 25 | Terminal | papel milimetrado claro, cor só nos desvios |

**A lacuna 26, 27 e 28.** Não existem, e nunca existiram: o histórico
(`git log --diff-filter=D -- docs/esbocos`) não registra deleção nenhuma, e os
três commits da pasta são só `aa6a76b` (01–10), `f41c875` (11–25 + `_briefing.md`
+ `_tabbar.html`) e `304126b` (29–40 + `gerador/`). A numeração simplesmente
pulou de 25 para 29. **NÃO ESTÁ NO CÓDIGO** nenhuma explicação para o salto.

#### 11 — Papel com ilustração (`11-papel-a.html`, 186 linhas)

**O esboço que virou a capa do aplicativo.** Título:
`NORVA — papel com ilustração`. Serifa `Georgia,"Times New Roman",serif` no
corpo, sistema no `.sf`. `h1` em 31px/400 com `<b>` em 700. Variáveis de aba:
`--tabbg:#faf7f2; --tabline:#e2dbd0; --tabink:#9a9083; --tabon:#b4552d;
--c2:#a9714b; --c3:#6f8188; --c4:#b28e42; --c5:#9a9083`
(`11-papel-a.html:5-6`).

A **cena da fábrica**, um SVG de largura inteira em `viewBox="0 0 364 150"`, com
`stroke="#2b271f" stroke-width="1.3"`, `stroke-linecap="round"` e
`stroke-linejoin="round"` — e cada grupo comentado no arquivo
(`11-papel-a.html:57-96`):

| elemento | traçado |
|---|---|
| chão | `M0 133h364` em `#d8cfc0` |
| nuvem 1 | `M28 34c-5 0-8-3-8-7s4-7 8-6c1-6 8-8 12-3 5-2 10 2 9 8` em `#b9b0a1` |
| nuvem 2 | `M150 24c-4 0-6-3-6-5s3-6 7-5c1-4 6-6 9-2 4-1 8 2 7 6` em `#c6bdae` |
| sol | `circle cx=336 cy=30 r=11` + oito raios, em `#b4552d` |
| telhado dente-de-serra | `M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16` |
| galpão | `M20 88h64v45H20z` |
| janelas | `M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z` |
| porta | `M56 133v-23h12v23` |
| chaminé | `M92 133V58h14v75M90 62h18` |
| fumaça | `M99 52c-7-5 5-11-2-17c-5-5 3-9 0-13` em `#c2b9a9` |
| câmara fria | `M124 76h54v57h-54z` + `M124 96h54M168 84v8M168 102v12` |
| floco | `M151 49v18M143 53.5l16 9M143 62.5l16-9` em `#6f8188` |
| três picolés | `rect` 20×34 `rx=7` em x=192/216/240, y=82, cada um com o palito `M…116v14`; o **do meio** com `fill="#b4552d" fill-opacity=".14"` |
| morango | `M290 122c-14-9-18-22-9-27 4-2.5 7-1 9 1 2-2 5-3.5 9-1 9 5 5 18-9 27z` + coroa `M290 96l-9-6M290 96l9-6M290 96v-9` + cinco sementes `r=1` |
| caixa de expedição | `M312 104h44v29h-44z` + `M312 113h44M334 104v29` + tampa `M318 104l6-8h26l6 8` |

Legenda em itálico embaixo (`.cap`, 11px, `font-style:italic`, `#a99e8f`):
*"Linha, câmara fria e a caixa que saiu — quarta-feira de manhã."*
(`11-papel-a.html:97`).

O cartão de clima traz uma novidade estrutural: um **medidor de chance de
chuva** — `.gauge{height:3px;background:#ece4d8}` com
`.gauge span{background:#6f8188}` largo a `47%` (`11-papel-a.html:32-33,118`) — e
uma linha com ícone de nuvem em 15px à esquerda e `amanhã +4°` em `#b4552d` à
direita.

Cada linha da lista ganhou **ícone de 26px em traço 1,4**: morango
(`#b4552d`), caixa de papelão (`#6f8188`, `M3.5 8.5h19v13h-19z…`) e etiqueta de
preço (`#b28e42`, `M13.5 3.5H22v8.5l-9.5 9.5a1.5 1.5 0 0 1-2.1 0L4 15.1a1.5 1.5
0 0 1 0-2.1z` + `circle cx=18 cy=8 r=1.4`). Os preços viraram **chips**:
`.chips em` com `border:1px solid #e2dbd0`, `border-radius:20px`,
`padding:3px 8px`, `#3d7a53` para queda e `#a8442a` para alta
(`11-papel-a.html:46-49,157`).

#### 12 — Papel em duas colunas (`12-papel-b.html`, 186 linhas)

Cabeçalho de jornal: `.plate` com `border-top:2px solid #221f1b` e
`border-bottom:1px`, "NORVA" centrado em 31px/700 `letter-spacing:.2em`, e um
ornamento `<i></i>diário da fábrica<i></i>` com dois filetes de 34×1px
(`12-papel-b.html:14-17,68-71`). Linha de data `space-between`: "quarta-feira, 2
de setembro" / "São Paulo". Manchete em 27px/700 e sublinha em itálico 13,5px.

**Capitular:** `.lead::first-letter{float:left;font-size:54px;line-height:.78;
padding:5px 8px 0 0;color:#b4552d;font-weight:700}` (`12-papel-b.html:30`) sobre
texto `text-align:justify;hyphens:auto`.

**Vinheta emoldurada:** `.cut{float:right;width:104px;border:1px solid #ded6c9;
padding:7px 7px 5px;background:#fff}` com legenda em itálico 9,5px separada por
`border-top` — *"Picolé, morango e o frio."* (`12-papel-b.html:26-28,90`). O
desenho dentro é um recorte: um picolé (`rect x=18 y=30 22×36 rx=8`), um floco e
um morango com `fill-opacity=".12"`.

**Duas colunas com fio vertical:** `.cols{border-top:2px solid #221f1b}` e
`.col.right{border-left:1px solid #ded6c9;padding-left:15px;margin-left:15px}`
(`12-papel-b.html:44-46`). À esquerda o clima em caixa `#f4efe6`; à direita "Na
casa" com três itens. As barras da semana viraram **contorno**:
`.bars i{border:1px solid #c9c0b1;border-radius:1px;background:#f4efe6}` e a de
hoje preenchida em `#221f1b` (`12-papel-b.html:37-38`). Legenda de figura:
*"Sete dias, altura relativa. A coluna cheia é hoje."*. Preços em linhas com
`border-bottom:1px dotted`. As quatro cores de aba foram achatadas para um cinza
só (`--c2`…`--c5` todas `#8c8375`).

#### 13 — Papel com cor (`13-papel-c.html`, 160 linhas)

Cinco cores nomeadas em `:root` (`13-papel-c.html:5-6`):

| variável | valor | uso |
|---|---|---|
| `--laranja` | `#BE551E` | bloco da produção, `<b>` do h1, ponto da polpa |
| `--musgo` | `#6C7A3B` | bloco do insumo, ponto do açúcar |
| `--petroleo` | `#1B5460` | bloco do clima, ponto da glucose |
| `--ocre` | `#C08C2A` | bloco da expedição |
| `--creme` | `#F7F0E2` | tinta sobre os blocos |
| `--papel` | `#FAF7F2` | fundo |
| `--tinta` | `#221F1B` | texto |

Quatro `.block` de **cor chapada** com `border-radius:3px` (canto quase reto) e
texto creme. O sol do bloco de clima é um SVG de 140px **sangrando pela direita**
(`.sunwrap{position:absolute;right:-24px;top:4px}`) com oito raios de 5px em
`#E8B441`, disco `r=30`, um anel `#F7F0E2` a `opacity:.55` e uma meia-lua
`#D98B2B` na base (`13-papel-c.html:87-97`). Barras em
`rgba(247,240,226,.42)` com hoje em creme puro. Estatísticas divididas por
`border-left:1px solid rgba(247,240,226,.3)`. Preços num cartão branco com
quadradinhos de cor 10×10 `border-radius:2px` como marcador.

#### 14 — Vidro com profundidade (`14-vidro-a.html`, ~230 linhas)

Fundo em três camadas fixas: `.sky` com degradê `#161a33`→`#0d1020`→`#131024`;
`.shapes`, um SVG de `inset:-80px` com `filter:blur(36px)` contendo **formas de
verdade** — um sol `r=60` `#ffab4d` com raios de 17px, duas ondas
(`#2f7bf0` a `.72` e `#1fb98f` a `.55`), um círculo frio `#5b7cfa`/`#8fd6ff` e um
brilho `#f07099`; e `.grain`, um `radial-gradient` branco a 10%
(`14-vidro-a.html:9-13,71-90`). O comentário no arquivo diz a intenção:
*"fundo: formas de verdade, bem desfocadas"*.

Painéis `.g` com `background:linear-gradient(150deg,#ffffff1f,#ffffff0d)`,
`border:1px solid #ffffff26`, `border-radius:28px`, `backdrop-filter:blur(24px)`
e `box-shadow:0 22px 44px -14px #00000090,0 2px 0 0 #ffffff1f inset`
(`14-vidro-a.html:22-25`). Cada painel carrega um **ícone marca-d'água** `.wm`
(`opacity:.11`) de 112 a 168px sangrando pelo canto — o picolé no painel de
produção, o sol no de clima, a gota no de insumo, o caminhão no de expedição e a
etiqueta no de preços. O painel de clima ganha classe extra `.warm` com degradê
âmbar. As comparações viraram **chips com ícone**: relógio para "ontem 478" e
seta de tendência para "+19", este com `background:#37d9a324` e cor `#7ff0c2`.
Mínima/chuva/amanhã viraram três `.wcell` com ícone (termômetro, gota, seta).

#### 15 — Vidro em mosaico (`15-vidro-b.html`, ~204 linhas)

Cinco `radial-gradient` no fundo (`#f0709966`, `#5b7cfa66`, `#ffb03a55`,
`#1fb98f5c`, `#8b5cf655`) sobre `#0c0f1c` (`15-vidro-b.html:8-13`). Layout
`display:grid;grid-template-columns:1fr 1fr;gap:13px`, e os blocos declaram sua
largura: `.w2{grid-column:span 2}` (`15-vidro-b.html:21,26`). Peças:

- **2×1 produção** — número em **78px/800 `letter-spacing:-.055em`** à esquerda e
  as sete barras de **108px de altura** à direita, com rótulos de uma letra só
  (`q s s d s t q`) em caixa alta;
- **1×1 insumo** e **1×1 expedição** — número em 46px/800;
- **2×1 clima** — temperatura em 64px/800 e um sol+nuvem+chuva de 126×106
  desenhado inteiro em SVG, com gradiente radial `#fff6cf`→`#ffab3d`;
- **três telinhas de preço** em `grid-template-columns:1fr 1fr 1fr`, cada uma com
  ícone de 18px (gota, cubo, ampulheta), o delta em 17px/800 e o nome em 10px.

#### 16 — Vidro claro (`16-vidro-c.html`, ~223 linhas)

A mesma identidade em modo dia: fundo `#eef1f9` com cinco manchas pastel
(`#ffd9c7`, `#cfdcff`, `#ffeec2`, `#c9f2e2`, `#e6d8ff`), `.shapes` a
`opacity:.5` com sol `#ffcf8a` e ondas `#a8d8ff`/`#9fe8cd`. Painéis
`linear-gradient(150deg,#ffffffd6,#ffffff9c)` com `border:1px solid #ffffffe0` e
`box-shadow:0 16px 34px -18px #1b2a5540,0 1px 0 0 #ffffff inset`
(`16-vidro-c.html:26-29`). **Mudança de ordem:** o clima **abre** o dia, antes
da produção (`16-vidro-c.html:109-110`). Duas faixas largas novas — `.alert`
(degradê `#ffe4ec`) e `.ship` (degradê `#e8e2ff`) — cada uma com uma **ilustração
de 42px pintada em massa** (o morango em `#ff8fae` com contorno `#e2557a`; o
caminhão em `#b9aef5`/`#d7d1fb` com contorno `#6f63c9`) e um `.badge` pílula à
direita ("1 dia", "hoje").

#### 17 — Suíço com pictograma (`17-suico-a.html`, ~134 linhas)

Único junto com 18 e 19 a trazer `<!doctype html><html lang="pt-BR"><head>`
completo. Fundo `#f4f3ee`. Cabeçalho com **régua de 7px** em cima e 1px embaixo.
Número em **84px/800 `letter-spacing:-.065em`**. Chips com
`border:2px solid #111` e o de destaque em `#e2340a` chapado. Semana em `grid` de
sete com `border-top:6px solid #111` e rótulos sobre `border-top:2px solid #111`.

Clima em `grid-template-columns:118px 1fr` com `border:3px solid #111`: à
esquerda um painel `#cfe3fb` com um **pictograma** de 102×97 — sol `r=19`
`#f5b301` com contorno de 4px, nuvem branca contornada e três gotas azuis
`#1148c9`; à direita a temperatura em 52px/800 e três linhas separadas por
`border-top:1px solid #111`, cada uma com um quadradinho de 10×10 de cor
(`#1148c9`, `#4f8ff0`, `#e2340a`).

**Os cinco pictogramas geométricos** — a assinatura desta variante
(`17-suico-a.html:103,109,115,121,127`):

| forma | cor | assunto |
|---|---|---|
| círculo `r=24` | `#e2340a` | Polpa de morango (insumo acabando) |
| triângulo `26,2 50,48 2,48` | `#1148c9` | Saiu para as lojas |
| quadrado 46×46 | `#f5b301` | Açúcar cristal (preço) |
| hexágono `26,2 48,14 48,38 26,50 4,38 4,14` | `#0a8f45` | Glucose 38DE (preço) |
| losango `26,2 50,26 26,50 2,26` | `#7b3fe4` | Polpa de morango (preço) |

Cada linha traz valor grande em 21px/800 e um `<small>` explicando ("até
acabar", "caixa", "mais barato", "mais cara", "mais barata").

#### 18 — Suíço em quatro cores (`18-suico-b.html`, ~146 linhas)

Cartaz de **faixas chapadas de largura inteira**, sem `.wrap`: preto `#111` de
base e cinco bandas (`18-suico-b.html:22-58`):

| faixa | cor | conteúdo | tamanho do herói |
|---|---|---|---|
| `.red` | `#e2210f` | Produção de hoje: 500 | **118px** |
| `.wkband` | `#111` | a semana em blocos `#2c2c30` com preenchimento branco, hoje `#ffd400` | — |
| `.blue` | `#0b53d9` | São Paulo 21° + pictograma de 112px | 72px |
| `.yel` | `#ffc400` (tinta `#111`) | Insumo acabando: 1 dia + triângulo de alerta | 46px |
| `.grn` | `#06913f` | Saiu para as lojas: 1 + caminhão em traço de 3,4 | 62px |
| rodapé | `#111` | três preços em `grid` de 3 separados por `border-left:2px solid #3a3a40` | 20px |

Comparações em `.cmp` com `border-top:2px solid currentColor` e divisórias
`border-left:2px solid currentColor` — a régua muda de cor junto com a faixa.
Fecha com `.foot{height:112px;background:#111}` como respiro da barra.

#### 19 — Suíço diagramático (`19-suico-c.html`, ~199 linhas)

Fundo `#f6f3e9`. **A conta aberta em diagrama de nós e setas**
(`19-suico-c.html:60-83`): duas caixas contornadas ("ONTEM 478", "QUARTA
PASSADA") ligadas ao número de hoje por duas curvas de Bézier verdes
(`#0a7d3c`) com marcador de flecha, rotuladas `+22` e `+19`; o 500 em `font-size
82` `text-anchor="end"` `letter-spacing="-4"`. Abaixo, a conta em texto:
**`500 − 478 = +22 · a quarta passada ficou 19 abaixo`** (`19-suico-c.html:83`).

Semana com **os valores impressos em cima** (`38 44 41 6 82 46 64`), barras em
altura de pixel (`30px 34px 32px 5px 64px 36px 50px`), uma **linha de média
tracejada** (`.avg{border-top:2px dashed #b3ada0;bottom:36px}` com rótulo
"MÉDIA") e a coluna de hoje marcada por `box-shadow:inset 0 5px 0 #d81f06`
(`19-suico-c.html:27-33,89-98`).

**Termômetro desenhado** de 190×160: tubo `rect 24,6 26×116 rx=13` contornado em
3px, bulbo `circle 37,138 r=19`, mercúrio `#d81f06`, sete traços de escala, e três
linhas de referência com rótulo dentro do próprio SVG — `AMANHÃ +4°` tracejada em
vermelho, `21° AGORA` sólida em preto de 3px, `MÍNIMA 13°` em `#1148c9`
(`19-suico-c.html:105-121`). Ao lado, uma gota de 80×100 **preenchida até 47%**
por `clip-path` (`<rect y="33.7" height="28" clip-path="url(#gota)">`) —
`19-suico-c.html:123-129`.

**Linha do tempo do insumo:** eixo de sete marcas (HOJE, +1…+6), tarja preta até
+1, tracejado vermelho depois, e uma flecha vertical em `+1` com o texto `ACABA
EM 1 DIA` (`19-suico-c.html:137-157`). **Diagrama de expedição:** FÁBRICA →
`1 CAIXA` → LOJA, com setas sólidas (`19-suico-c.html:163-176`). Preços em `grid`
de três com triângulos SVG para cima/baixo.

#### 20 — Orgânico ilustrado (`20-organico-a.html`, 267 linhas)

**A segunda das três finalistas.** Cena de **328px** com quatro degradês
declarados em `<defs>` (`20-organico-a.html:69-80`):

| id | tipo | paradas |
|---|---|---|
| `sky` | linear vertical | `#f1f9f2` 0 · `#ddf1e5` .5 · `#c5ead6` 1 |
| `hf` (colina de trás) | linear vertical | `#b6e4c8` → `#9bd9b4` |
| `hn` (colina da frente) | linear diagonal | `#6cbd92` → `#4ba078` |
| `glow` | radial | `#ffe9a5` a `.9` → `#ffe9a5` a `0` |

Camadas, na ordem em que são desenhadas: céu · halo do sol (`r=64`) · oito raios
`#ffd571` de 3,2px a `opacity:.9` · disco `#ffe07c` `r=31` · **nuvem de três
elipses + um `rect rx=8`** cobrindo o sol · **cinco gotas** `#a3d2ec` (três
grandes e duas menores a `opacity:.7`) — *"47% de chance de chuva"* diz o
comentário no arquivo (`20-organico-a.html:99`) · colina de trás · **a fábrica ao
longe** em `#63b48d` (galpão 60×24, três dentes de serra, chaminé
`rect 364,162 9×44`), quatro janelas `#2f7a55` a `.42` e três bolas de fumaça
brancas a `.72` · colina da frente `url(#hn)` · uma camada branca a `.14` ·
**uma onda que "devolve a página"** na cor do fundo (`#f4f7f1`)
(`20-organico-a.html:132`).

Sobre a cena: marca em 12px `letter-spacing:.36em` `#2c5c44`, data 12,5px, número
em **76px peso 300 `letter-spacing:-.05em`** `#0f3325`, unidade 14px, e dois
chips brancos a `#fffffff2` com `box-shadow:0 4px 12px #16402c14`.

**O clima mora DENTRO da cena**, como uma barra flutuante:
`.wx{position:absolute;left:20px;right:20px;top:216px;height:86px;
border-radius:30px;background:#ffffffc7;box-shadow:0 12px 30px #14392816;
backdrop-filter:blur(7px)}` com um separador vertical de 1px e três linhas com
ícone (termômetro, gota, sol) — `20-organico-a.html:22-31,146-163`.

Cartões `border-radius:32px`, `box-shadow:0 10px 26px #1b3d2c0f`. **A semana é um
SVG de barras arredondadas** (`rx=12`) em `#d3e6d8` sobre uma onda de base
`#eaf3ea`, com a de hoje em degradê `#5cb287`→`#2f8a5d` e **um pontinho
`#ffd571` de `r=6` acima dela** (`20-organico-a.html:170-187`). Cabeçalho de
cartão com um comentário à direita: *"hoje é o segundo melhor dia"*
(`20-organico-a.html:169`).

Os crachás das linhas são **ilustrações preenchidas de 44px em silhueta orgânica**
— um contorno tipo pedra (`M27 2c12.5 0 25 6.5 25 21s-9 29-23 29S2 42.5 2 27
14.5 2 27 2z`) atrás do objeto (`20-organico-a.html:193-210`). Os três preços
viraram `.tile` `#f8faf6` `border-radius:20px` com uma **fruta desenhada de 24px**
cada: morango (`#e8556f` com sementes `#ffd9a0` e folha `#5ea320`), cristais de
açúcar (quatro `rect` rotacionados em `#89a874`) e uma gota de glucose
(`#e9b55e`) — `20-organico-a.html:219-245`.

#### 21 — Orgânico frutado (`21-organico-b.html`, 240 linhas)

Fundo `#fff8ee`, tinta `#33251f`. Topo de **226px** com degradê de fruta
`#f79a2b`→`#f2685a`→`#e8455f` cortado por onda, mais **frutas soltas no ar**
(três círculos a `opacity:.26`–`.5`) e um **limão geométrico cortado pela borda**:
`circle r=28 #a8d45c` + `circle r=21.5 #e9f5c8` + quatro traços de gomo
(`21-organico-b.html:79-97`). Texto sobre o herói em branco; chips
`#ffffff33` com `border:1px solid #ffffff5e`.

**A semana virou bolhas:** sete círculos de raio proporcional ao dia
(`r=12.2, 13.4, 12.8, 6.2, 20.6, 13.8, 19.6`), cada um com um brilho branco a
`.5`, o domingo em `#e7d9c2` (dia fraco), a segunda em `#f79a2b` (pico) e hoje em
`#e8455f` com um halo `#ffdfe4` (`21-organico-b.html:115-127`). Cabeçalho: *"o
pico foi na segunda"*.

`.hero` do insumo em `#ffedf0` com **um morango ilustrado de 96×104**: corpo em
degradê `#f4738a`→`#e8455f`→`#cf2a48`, brilho elíptico rotacionado a `.22`, oito
sementes `#ffe0a3`, coroa `#7bb93a` e cabinho `#5c8f28` de 4,5px
(`21-organico-b.html:160-180`). Dois quadros `.q` de fruta: `.manga` `#fff0dc`
com tinta `#d1811e`, `.limao` `#f1f8e0` com tinta `#6c9b28`. O quadro do limão
lista os três preços em linhas de 10,5px; o da manga tem duas ondas
`#f8c47e` como rodapé decorativo.

#### 22 — Orgânico noturno (`22-organico-c.html`, 259 linhas)

**A terceira finalista.** Fundo `#0b1a12`, tinta `#e6f4ea`. Cena de **312px** com
quatro definições (`22-organico-c.html:70-82`):

| id | conteúdo |
|---|---|
| `ceu` | linear `#0c1a12` 0 · `#14291d` .55 · `#1d3b29` 1 |
| `luar` | radial `#ffe3ae` a `.38` → `0` |
| `horiz` | radial em `cx=.78 cy=.95 r=.7`, `#4e9a72` a `.3` → `0` |
| `crescente` | **máscara**: `rect 286,42 70×70` branco menos `circle 305,65 r=27` preto |

Doze estrelas de raio 1 a 1,5 com opacidades de `.35` a `.7`, mais um brilho de
quatro traços (`22-organico-c.html:88-98`). **A lua é "o sol da noite"**: halo
`circle 320,76 r=62 url(#luar)` e disco `r=31 #ffe3ae mask="url(#crescente)"`
(`22-organico-c.html:100-102`). Nuvem escura em três elipses `#25412f`/`#2b4b37`
com um realce de luar por cima (`stroke="#ffe3ae" opacity=".55"`) e quatro gotas
`#8ab6e8`. **A fábrica está acesa:** corpo `#0d2115` e quatro janelas `#ffcf85`
com opacidades diferentes (`1`, `.5`, `1`, `.7`) — as luzes não são todas iguais
(`22-organico-c.html:123-136`).

O conteúdo sobe `-60px` e vive em painéis **de vidro escuro**:
`.glass{background:linear-gradient(155deg,#ffffff17,#ffffff09);
border:1px solid #ffffff1c;border-radius:32px;backdrop-filter:blur(14px);
box-shadow:0 18px 40px #00000047}` (`22-organico-c.html:23-24`). O número tem
`text-shadow:0 0 34px #6fd6a03d`.

Estrutura diferente das outras duas: **um painel único** com tudo — a semana, as
duas linhas e os preços — separados por **divisórias que são ondas desenhadas**
(`<svg class="div">` com um `path` de curva em `stroke-opacity:.14`), uma
descendo e a de baixo subindo (`22-organico-c.html:207,231`). A barra de hoje
ganha um segundo `rect` atrás com `filter:url(#brilho)`
(`feGaussianBlur stdDeviation="7"`) para brilhar (`22-organico-c.html:188-202`).

#### 23 — Terminal com uma cor por tipo de dado (`23-terminal-a.html`, 209 linhas)

`font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace`, fundo `#070910`.
**Cada bloco tem um trilho de 3px na cor do seu tipo de dado**, via variável
CSS: `.blk::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
background:var(--k)}` (`23-terminal-a.html:16-17`).

| bloco | `--k` | fundo |
|---|---|---|
| produção | `#2ee6a8` | `linear-gradient(180deg,rgba(46,230,168,.11),transparent 58%),#0c1018` |
| insumo | `#ffb02e` | idem com `rgba(255,176,46,.11)` a 62% |
| expedição | `#9d7bff` | idem com `rgba(157,123,255,.11)` a 62% |
| clima | `#38c6f4` | idem com `rgba(56,198,244,.12)` a 66% |
| custo | `#4ea8ff` | idem com `rgba(78,168,255,.10)` a 62% |

**Gráfico de área** de 354×112 (`23-terminal-a.html:82-108`): duas linhas de
grade tracejadas (`stroke-dasharray="2 5"`), área sob a curva com degradê
`#2ee6a8` de `.42` a `0`, `polyline` de 2,2px pelos sete pontos
(`14,59.4 68,55.2 123,57.3 177,81.8 231,28.6 286,53.8 340,41.2`), seis nós
`r=2.6` de contorno e o de hoje sólido `r=4` com halo `r=7` e uma queda vertical
tracejada até a base. Os rótulos dos dias são `<text>` dentro do SVG em
`font-family:ui-monospace`.

Novidades numéricas: um `.chip` `+3,9%` no cabeçalho da produção; uma barra
`.lvl` de 7px mostrando **9% de nível** de polpa; `escala ±3% · linha central =
sem mudança` como legenda dos desvios; e três `.trk` de 8px com marca de zero em
`left:50%` e uma barra posicionada por `left`/`width` proporcional ao desvio
(`23-terminal-a.html:120,178-189`).

#### 24 — Terminal com instrumentos (`24-terminal-b.html`, ~246 linhas)

Fundo `#08090c`, acento `#38e08b`. Cabeçalho em caixa contornada com um **LED**:
`.led{width:7px;height:7px;border-radius:50%;background:#38e08b;
box-shadow:0 0 8px #38e08b}` (`24-terminal-b.html:14-15`).

**Três barras de progresso grossas comparáveis**, todas de 22px de altura com
preenchimento em listras (`repeating-linear-gradient(90deg,#38e08b 0 9px,#26b56d
9px 11px)`), o valor impresso dentro à direita, e **uma régua compartilhada
embaixo** com marcas em 0/25/50/75/100% e rótulos `440 460 480 500 520`
(`24-terminal-b.html:96-105`):

| linha | largura | rótulo |
|---|---|---|
| hoje | 75% | `500` |
| ontem | 47,5% | `478` |
| qua passada | 51,25% | `19 abaixo` |

Clima como **mostrador de ponteiro** de 158×98 mais um anel de 88×88 com
`stroke-dasharray="94.5 201.1"` e `transform="rotate(-90 46 46)"`, com legenda de
três chaves de cor (`#ff6b4a` agora 21°, `#4fd1ff` mínima 13°, `#ffb02e` amanhã
+4°) — `24-terminal-b.html:119-152`. Insumo como **tanque de nível** de 152×106
com hachura diagonal (`<pattern id="hz" patternTransform="rotate(45)">`).
Expedição como **odômetro**: `.dig` com os dígitos apagados desenhados no fundo —
`<span style="color:#232a38">00</span>1<em>CX</em>` (`24-terminal-b.html:194`).
Custo em `.meter` de 15px com marca de zero e um ponteiro `<u>` de 2px sobreposto
à barra.

#### 25 — Terminal em papel milimetrado (`25-terminal-c.html`, ~234 linhas)

Monoespaçado sobre **papel milimetrado desenhado em CSS**: quatro
`linear-gradient` de 1px em `rgba(31,92,64,.15)` e `rgba(31,92,64,.07)` com
`background-size:40px 40px,40px 40px,8px 8px,8px 8px` (`25-terminal-c.html:8-13`).
Fundo `#f4f3ea`, tinta `#17201b`.

Estrutura de **formulário técnico**: `.sheet` com `border:1.5px solid #17201b` e
o rótulo `folha de medição`; campos `data` / `por extenso`
(`25-terminal-c.html:79-85`). Cinco seções **numeradas** por um selo invertido
(`.sec i{border:1px solid #17201b;background:#17201b;color:#f4f3ea}`) com um
filete que preenche a linha (`.sec u{flex:1;height:1px;background:#b9bdae}`):

| nº | seção |
|---|---|
| 01 | produção — três células em `grid 1.4fr 1fr 1fr` (hoje 500 UN · ontem 478 · Δ qua passada +19) |
| 02 | insumo — `.alert` com `border:1.5px solid #b3241c` e fundo `rgba(179,36,28,.07)` |
| 03 | condições · são paulo — termômetro desenhado + três `.trk` hachurados |
| 04 | custo de insumo · desvio — `<table>` com coluna `.dev` de 92px e barra a partir do centro |
| 05 | expedição — rodapé `border:1px dashed #9ea89c` |

Cor **só nos desvios**: `.dn{color:#1a7f4b}` e `.up{color:#a66a10}`, com a
legenda escrita — *"escala ±3% · verde cai, âmbar sobe"* (`25-terminal-c.html:204`)
— e *"amanhã sobe 4° · planeje a produção"* (`25-terminal-c.html:182`).

---

### 32.6 Terceira rodada — as três finalistas, doze variações (commit `304126b`)

A reação do dono, transcrita: *"quase soltei um palavrão de tão impressionado.
Dessa vez você acertou na mão — acertou tanto que a gente vai ter que refinar
mais, porque fiquei indeciso por ter gostado de vários"*
(`docs/esbocos/README.md:82-84`).

Ele escolheu três — **11 (Papel ilustrado)**, **20 (Orgânico dia)** e
**22 (Orgânico noite)** — com uma regra: **quatro variações de cada, duas claras
e duas escuras** (`docs/esbocos/README.md:84-86`).

Tabela transcrita de `docs/esbocos/README.md:88-101`:

| # | família | tema | o que muda |
|---|---|---|---|
| 29 | Papel | claro | a cena da fábrica cresce e vira o assunto |
| 30 | Papel | claro | a cena vira vinheta ao lado do título; mais texto |
| 31 | Papel | escuro | tinta clara sobre preto quente — a revista em papel preto |
| 32 | Papel | escuro | o escuro com a vinheta |
| 33 | Orgânico | claro | a paisagem maior, com a fábrica entre as colinas |
| 34 | Orgânico | claro | a semana vira linha ondulada com pontos |
| 35 | Orgânico | escuro | a mesma paisagem ao entardecer |
| 36 | Orgânico | escuro | verde-musgo profundo, cena reduzida a silhueta |
| 37 | Noite | escuro | a noite ilustrada, luz acesa no galpão |
| 38 | Noite | escuro | a noite com a semana em linha |
| 39 | Noite | claro | a MESMA identidade ao amanhecer |
| 40 | Noite | claro | dia limpo |

#### O achado da rodada, que não estava na pergunta

*"As três famílias não são três aplicativos, são **dois**: o Papel é um, e o
Orgânico dia e noite são a mesma identidade em dois momentos do mesmo dia. O 39 e
o 40 provam isso — a identidade noturna vira dia trocando só o céu. Ou seja, dia
e noite não são uma escolha: são os dois temas que o app já tem, com a paisagem
acompanhando"* (`docs/esbocos/README.md:103-107`).

#### A recomendação contra a variação mais bonita

*"A semana em linha ondulada (34, 38, 40) sugere continuidade entre os dias que
não existe: domingo não desce suavemente até segunda, ele é outro dia. **Barra
tem base zero, curva não tem**"* (`docs/esbocos/README.md:109-112`).

#### Os dois defeitos vistos no render, não no código

Da mensagem do commit `304126b`: *"Duas correções vieram de olhar o render, não
de escrever: a fábrica estava sendo desenhada ANTES das colinas e sumia atrás
delas, e a lua do amanhecer caía em cima da palavra NORVA."* A correção da
primeira está na ordem de emissão do SVG (`gerador/pecas.py:107-109`: colina de
trás → fábrica → colina da frente); a da segunda, na posição da lua do amanhecer
(`gerador/pecas.py:89`: `M386 40a13 13 0 1 0 0-24 16 16 0 0 1 0 24z`, empurrada
para o canto superior direito).

#### 36 e 38 são o mesmo arquivo

`diff docs/esbocos/36-organico-escuro-b.html docs/esbocos/38-noite-escuro-b.html`
devolve **uma única diferença: a linha do `<title>`** ("orgânico musgo" contra
"noite mínima"). A causa está no gerador: `36` é
`organico(..., 'noite', 'noite', 'blob')` (`gerador/gerar.py:189`) e `38` é
`noite(..., 'noite', 'noite', 'blob')` (`gerador/gerar.py:198`), e a função
`noite()` **apenas delega** para `organico()` (`gerador/gerar.py:193-194`). Ou
seja: dos doze esboços da terceira rodada, **onze são visualmente distintos**, e
a família "Noite" que o dono achou ser a terceira era, no gerador, a mesma
função com a mesma paleta. Isso é a mesma conclusão de
`docs/esbocos/README.md:103-107`, chegando por outro caminho.

Do mesmo jeito, `40` difere de `34` **apenas no céu e nas colinas** (o astro do
amanhecer no lugar do sol do dia, `#ffe3d0`/`#ffd0b0` no lugar de
`#dff0e6`/`#bfe3cf`, `#c9e6cf`/`#a4d6b6` no lugar de `#a9dcc0`/`#7cc9a6`) — que é
literalmente a prova que o README reivindica.

---

### 32.7 O gerador em Python

*"Os doze saíram de um gerador em Python, e não de doze arquivos escritos à mão.
A razão é a mesma que faz o `_briefing.md` existir: doze telas comparáveis
precisam do mesmo dado, da mesma barra de abas e do mesmo espaçamento — o que
muda entre elas tem que ser a **decisão de desenho**, não um descuido de quem
copiou. O gerador também é o que permite trocar a paleta de uma família inteira
numa linha quando o dono apontar a escolhida"*
(`docs/esbocos/README.md:114-121`).

Dois arquivos:

| arquivo | linhas | conteúdo |
|---|---|---|
| `docs/esbocos/gerador/pecas.py` | 110 | *"As peças compartilhadas pelos doze esboços: paletas, cenas e a barra de abas"* (`pecas.py:2`) |
| `docs/esbocos/gerador/gerar.py` | 200 | *"Os doze esboços: três famílias, quatro variações cada, duas claras e duas escuras"* (`gerar.py:2`) |

`gerar.py` importa de `pecas` os nomes `PALETAS, TABBAR, TABCSS, cena_fabrica,
cena_colina` (`gerar.py:6`) depois de inserir o próprio diretório em `sys.path`
(`gerar.py:5`).

**A saída é um caminho absoluto de scratchpad, não `docs/esbocos/`:**

```python
SAIDA = Path('/tmp/claude-0/-home-user-SZG-app/3cd30dd5-15bc-5fda-b553-6d2524a27ce3/scratchpad/esbocos')
```

(`gerar.py:8`). Consequência para quem reconstruir: **rodar `gerar.py` hoje não
regenera os arquivos versionados** — ele escreve num diretório de sessão. Os doze
`.html` foram copiados de lá para `docs/esbocos/` à mão.

#### O dado, uma vez só

```python
SEMANA = [38, 44, 41, 6, 82, 46, 64]
DIAS = ['qui', 'sex', 'sáb', 'dom', 'seg', 'ter', 'qua']
```

(`gerar.py:10-11`). É a única fonte do gráfico nos doze arquivos — que é por que
nenhum deles repete o erro do 8% da primeira rodada.

#### As seis paletas (`pecas.py:21-40`)

Doze chaves cada, todas obrigatórias (o `BASE_CSS.format(**p)` explode se faltar
uma):

| chave | `papel-claro` | `papel-escuro` | `org-claro` | `org-entardecer` | `noite` | `amanhecer` |
|---|---|---|---|---|---|---|
| `bg` | `#faf7f2` | `#15110d` | `#f3f7f3` | `#1b1626` | `#0c1512` | `#fdf5ef` |
| `surface` | `#ffffff` | `#1e1915` | `#ffffff` | `#241d33` | `#13201b` | `#ffffff` |
| `ink` | `#221f1b` | `#f4ece0` | `#16281d` | `#f7efe6` | `#eaf5ee` | `#1d2a24` |
| `muted` | `#6f6558` | `#b6a894` | `#4d6055` | `#c0b2c8` | `#9db8a9` | `#54655c` |
| `faint` | `#a2988a` | `#7e7161` | `#8ba192` | `#8a7d97` | `#6b8377` | `#9aa79f` |
| `line` | `#e2dbd0` | `#2f271f` | `#dde9df` | `#332a45` | `#1c2f27` | `#eadfd6` |
| `accent` | `#b4552d` | `#e08a5a` | `#2f7d5c` | `#f0955a` | `#5ef2a8` | `#2f7d5c` |
| `cool` | `#6f8188` | `#8fa8b0` | `#5b8ec9` | `#8aa8e0` | `#7fb6e8` | `#d98b6a` |
| `ok` | `#3d7a53` | `#6fbf8f` | `#2f7d5c` | `#6fd6a0` | `#5ef2a8` | `#2f7d5c` |
| `warn` | `#a8442a` | `#e8875f` | `#c2751f` | `#f0955a` | `#f5a35e` | `#c2751f` |
| `c2` (Produção) | `#a9714b` | `#e0a97f` | `#e29b52` | `#f0b07a` | `#7fd8a8` | `#e08a5a` |
| `c3` (Transporte) | `#6f8188` | `#8fa8b0` | `#6b7fd0` | `#9fb6ec` | `#7fb6e8` | `#6b8fd0` |
| `c4` (Relatórios) | `#b28e42` | `#d9b76a` | `#b28e42` | `#e5c377` | `#e5c377` | `#c9a24a` |
| `c5` (Mais) | `#9a9083` | `#9a9083` | `#8ba192` | `#9a90a8` | `#7f9a8c` | `#9aa79f` |

#### `cena_fabrica(p, altura=150, detalhe='cheio')` (`pecas.py:43-67`)

*"A linha de produção em traço: galpão, chaminé, câmara fria, picolés, morango,
caixa"* (`pecas.py:44`). Assinatura: recebe a paleta, uma altura (padrão 150) e
um nível de detalhe (`'cheio'` ou qualquer outra coisa, que ativa o modo curto).
Usa quatro cores da paleta — `tinta=ink`, `quente=accent`, `frio=cool`,
`fraco=faint` (`pecas.py:45`).

O tronco comum (sempre desenhado), em `viewBox="0 0 364 {altura}"`, `fill="none"`,
`stroke={ink}`, `stroke-width="1.3"`, cantos redondos (`pecas.py:57-66`): chão ·
uma nuvem · sol em `accent` (`circle cx=336 cy=30 r=11` + oito raios) · telhado
dente-de-serra · galpão · quatro janelas · porta · chaminé · fumaça.

O bloco `extra`, só quando `detalhe == 'cheio'` (`pecas.py:47-56`): câmara fria ·
floco em `cool` · **três picolés** (`rect` 20×34 `rx=7` em x=192/216/240, o do
meio com `fill-opacity=".16"` em `accent`) · morango em `accent` (**sem as cinco
sementes que o 11 tinha**) · caixa de expedição.

`aria-label="A fábrica"`, `role="img"`.

#### `cena_colina(p, momento='dia')` (`pecas.py:69-110`)

*"A paisagem: colinas, céu e o astro do momento"* (`pecas.py:70`). Quatro
momentos, e cada um define quatro cores mais um astro:

| momento | `ceu_a` → `ceu_b` | `colina_a` / `colina_b` | astro |
|---|---|---|---|
| `dia` | `#dff0e6` → `#bfe3cf` | `#a9dcc0` / `#7cc9a6` | sol `r=30 #ffd76a` + 8 raios de 5px + **nuvem branca** + **três gotas `#8ec5fc` `r=4`** |
| `entardecer` | `#f7a26b` → `#4b3a72` | `#4b3a70` / `#332856` | disco `r=26 #ffd08a` + elipse de reflexo `#ffb37a` a `.35` |
| `amanhecer` | `#ffe3d0` → `#ffd0b0` | `#c9e6cf` / `#a4d6b6` | disco `r=26 #ffca7a` + reflexo `#ffd9a8` a `.45` + **lua minguante branca a `.8` no canto** |
| `noite` (else) | `#132a23` → `#0a1713` | `#1e4536` / `#15332a` | halo `r=34 #5ef2a8` a `.10` + **lua crescente `#f7e6b5`** + **cinco estrelas** |

Duas cores derivam do momento, não da paleta (`pecas.py:96-98`):
`escuro = momento in ('noite','entardecer')`; o corpo da fábrica é `#0e211b` se
escuro e `#3f8f6a` se não; a janela é `#ffd98a` se escuro e `#ffffff` se não. É
assim que "a luz acesa no galpão" aparece só de noite e no entardecer.

A fábrica desenhada (`pecas.py:99-101`): galpão `M282 156h60v30h-60z`, três
dentes de serra `M282 156l10-15 10 15 10-15 10 15 10-15 10 15`, chaminé
`rect 348,132 9×54`, e três janelas 8×8 em x=290/304/318, y=166.

As duas colinas (`pecas.py:107,109`):
`M0 150c70-22 120 14 206 2s136-30 206-12v70H0z` e
`M0 182c80-16 130 12 206 4s130-22 206-6v34H0z`.

O SVG usa `viewBox="0 0 412 210" preserveAspectRatio="none"`,
`aria-label="A paisagem"`, e a ordem de camadas é céu → astro → colina de trás →
fábrica → colina da frente (a correção do commit).

#### `barras(p, redondo=False)` (`gerar.py:13-22`)

Devolve `(html, css)`. `redondo=True` dá `border-radius:10px 10px 4px 4px`;
`False` dá `2px`. Sete `<i>` com `height:{h}%`, e o de índice 6 recebe
`class="on"`. CSS: `.bars{display:flex;gap:8px;align-items:flex-end;height:56px;
margin:14px 0 5px}`, trilha em `line`, hoje em `accent`, rótulos em 10,5px
`faint`.

O `redondo` é decidido pela fonte, não passado à mão:
`barras(p, redondo=(fonte == SANS))` (`gerar.py:106`) — **o Papel tem barra reta,
o Orgânico tem barra arredondada**, e isso é consequência de uma linha.

#### `onda_semana(p)` (`gerar.py:24-37`)

*"A semana como linha ondulada com pontos, para as variantes de blob"*
(`gerar.py:25`). Sete pontos em `(24 + i*60, 92 - h*0.7)`, ligados por curvas
cúbicas com pontos de controle no meio horizontal
(`C{(x0+x1)/2} {y0} {(x0+x1)/2} {y1} {x1} {y1}`), traço de 3px em `line`; bolas
`r=4` em `line`, a de hoje `r=7` em `accent`; rótulos em `<text y="108">` de 10px
em `faint`. `viewBox="0 0 388 116"`.

É a forma que o próprio README recomenda contra
(`docs/esbocos/README.md:109-112`).

#### `clima_cartao(p, estilo='cartao')` (`gerar.py:39-58`)

Devolve `(html, css)`. `estilo='cartao'` dá `border-radius:4px`; qualquer outro
valor (na prática `'macio'`) dá `22px` (`gerar.py:40`). Conteúdo fixo: sol em
traço de 72px (`circle r=15` com `fill="{accent}22"` — 13% de opacidade em hex),
kicker `são paulo · agora`, temperatura em 42px, o **medidor de chuva** de 3px
com `width:47%` pintado em `cool`, e uma linha `space-between` com
`47% de chance de chuva` à esquerda e `amanhã +4°` em `accent` à direita.

**Este CSS morre na família Orgânico.** `pagina()` escolhe
`'cartao' if fonte == SERIF else 'macio'` (`gerar.py:107`), mas o `css_extra` do
Orgânico sobrescreve o cartão inteiro com
`.weather{margin-top:0;border:0;padding:0;background:transparent}`
(`gerar.py:182`) — então o raio de 22px nunca aparece em nenhum dos oito arquivos
orgânicos.

#### `lista(p)` e `LISTA_CSS` (`gerar.py:60-85`)

Três linhas fixas, cada uma com ícone de 26px em traço 1,5:

| linha | ícone | cor | valor |
|---|---|---|---|
| Polpa de morango — *"acaba em um dia, pelo consumo da semana"* | morango | `accent` | `1 dia` |
| Saiu para as lojas — *"uma caixa, hoje de manhã"* | **caminhão** (`M3 7.5h12v10H3z` + `M15 11h4l3.5 3.5v3H15z` + duas rodas `r=2`) | `c3` | `1 caixa` |
| Preços que mexeram | etiqueta | `c4` | três chips |

**Mudança estrutural em relação ao 11:** a linha da expedição trocou a **caixa de
papelão** (`11-papel-a.html:142`) por um **caminhão** (`gerar.py:66-67`) — o mesmo
desenho do ícone da aba Transporte.

`LISTA_CSS` (`gerar.py:75-85`) usa `str.format` com nomes de paleta: `.rule`
1px em `{line}`, `.row` com `border-bottom:1px solid {line}` e `padding:12px 0`,
`.t` 17px em `{ink}`, `.s` 12,5px em `{muted}`, `.v` 19px, `.chips em` pílula de
20px com `border:1px solid {line}` e fundo `{surface}`, `.dn{color:{ok}}` e
`.up{color:{warn}}`.

#### `BASE_CSS` (`gerar.py:87-98`)

O esqueleto comum aos doze:

```
*{margin:0;padding:0;box-sizing:border-box}
body{width:412px;min-height:915px;overflow-x:hidden;background:{bg};color:{ink};
 -webkit-font-smoothing:antialiased;font-family:{fonte}}
.sf{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{padding:24px 24px 112px}
.kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:{faint}}
h1{font-size:31px;line-height:1.08;margin-top:9px;font-weight:400;letter-spacing:-.01em;color:{ink}}
h1 b{font-weight:700}
.cap{font-size:11px;font-style:italic;color:{faint};margin-top:4px}
.note{font-size:14.5px;color:{muted};line-height:1.55;margin-top:12px}
.note b{color:{ink};font-weight:700}
.scene svg{display:block;width:100%;height:auto}
```

Duas famílias tipográficas, e só duas (`gerar.py:100-101`):

```python
SERIF = 'Georgia,"Times New Roman",serif'
SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'
```

#### `pagina(arquivo, titulo, paleta, fonte, corpo, css_extra='')` (`gerar.py:104-119`)

O montador. Faz, na ordem:

1. `p = PALETAS[paleta]`;
2. gera barras (arredondadas se a fonte é `SANS`) e clima (raio 4px se a fonte é
   `SERIF`, 22px se não);
3. substitui **três marcadores** no corpo: `{{BARRAS}}`, `{{CLIMA}}` e
   `{{LISTA}}`;
4. concatena o CSS na ordem `BASE_CSS` · `barras_css` · `clima_css` ·
   `LISTA_CSS` · `TABCSS` · `css_extra`, todos formatados com `**p`;
5. escreve
   `<!doctype html><meta charset="utf-8"><title>NORVA — {titulo}</title>` + o
   `<style>` + o corpo + `TABBAR`, em UTF-8;
6. imprime `escrito {arquivo}`.

`CABECA` e `RESUMO` são constantes de texto (`gerar.py:122-124`):

- `CABECA`: `<div class="kicker sf">NORVA &middot; quarta, 2 de setembro</div>` +
  `<h1>Hoje a fábrica<br><b>fez 500 unidades</b></h1>`;
- `RESUMO`: *"Ontem foram **478** — hoje saíram **22 a mais**. Contra a quarta
  passada, **19 acima**. O ritmo da semana está firme."*

Note que o resumo **calcula** a diferença diária (500 − 478 = 22) além de repetir
o `+19` do briefing — todo número com sua comparação, como a regra pede.

#### `papel(arquivo, titulo, paleta, escala)` (`gerar.py:128-141`)

Duas escalas:

- **`'grande'`** — cena de largura inteira com `detalhe="cheio"` e a legenda
  *"A linha inteira — do tacho à caixa que saiu."*; ordem do corpo:
  CABEÇA → cena → BARRAS → RESUMO → CLIMA → LISTA; CSS extra
  `.scene.big{margin:14px -6px 2px}` (sangra 6px para cada lado);
- **`'vinheta'`** — cena pequena com `detalhe="curto"` dentro de um `flex` ao
  lado do título; ordem: (vinheta + CABEÇA) → RESUMO → BARRAS → CLIMA → LISTA;
  CSS extra `.vin{display:flex;gap:14px;align-items:flex-start}`,
  `.scene.mini{flex:0 0 120px;opacity:.9}`, `.vin h1{font-size:26px}`.

Sempre com `SERIF`.

#### `organico(arquivo, titulo, paleta, momento, forma)` (`gerar.py:151-183`)

Topo: `cena_colina(p, momento)` com o texto sobreposto em `.sobre`
(`position:absolute;left:24px;top:26px`) — marca em 13px
`letter-spacing:.22em`/700, dia em 13px, número em **64px/600
`letter-spacing:-.04em`**, unidade em 14px, e duas pílulas
(`ontem 478` e `↑ +19 que na quarta passada`) em `{surface}cc`.

Duas formas:

| `forma` | semana | raio dos cartões |
|---|---|---|
| `'cartao'` | `{{BARRAS}}` (as sete colunas) | `24px` |
| `'blob'` | `onda_semana(p)` (a curva) | `38px 38px 30px 30px` |

Corpo: topo → cartão "A semana" → cartão com CLIMA → cartão com LISTA. O `.wrap`
sobe **-26px** por cima da paisagem (`margin-top:-26px`), a paisagem tem
`height:210px`, os cartões levam `box-shadow:0 8px 28px #0000000f`, e o CSS extra
zera três coisas herdadas: `.rule{display:none}`,
`.row:last-child{border-bottom:0}` e o cartão do clima
(`.weather{margin-top:0;border:0;padding:0;background:transparent}`).

Sempre com `SANS`.

#### `noite(arquivo, titulo, paleta, momento, forma)` (`gerar.py:193-194`)

```python
def noite(arquivo, titulo, paleta, momento, forma):
    organico(arquivo, titulo, paleta, momento, forma)
```

Delegação pura. É a causa de `36` e `38` serem byte a byte iguais fora do título.

#### As doze chamadas, exatas (`gerar.py:144-147`, `186-189`, `197-200`)

| arquivo | função | paleta | momento | forma/escala |
|---|---|---|---|---|
| `29-papel-claro-a.html` | `papel` | `papel-claro` | — | `grande` |
| `30-papel-claro-b.html` | `papel` | `papel-claro` | — | `vinheta` |
| `31-papel-escuro-a.html` | `papel` | `papel-escuro` | — | `grande` |
| `32-papel-escuro-b.html` | `papel` | `papel-escuro` | — | `vinheta` |
| `33-organico-claro-a.html` | `organico` | `org-claro` | `dia` | `cartao` |
| `34-organico-claro-b.html` | `organico` | `org-claro` | `dia` | `blob` |
| `35-organico-escuro-a.html` | `organico` | `org-entardecer` | `entardecer` | `cartao` |
| `36-organico-escuro-b.html` | `organico` | `noite` | `noite` | `blob` |
| `37-noite-escuro-a.html` | `noite` | `noite` | `noite` | `cartao` |
| `38-noite-escuro-b.html` | `noite` | `noite` | `noite` | `blob` |
| `39-noite-claro-a.html` | `noite` | `amanhecer` | `amanhecer` | `cartao` |
| `40-noite-claro-b.html` | `noite` | `org-claro` | `amanhecer` | `blob` |

Duas combinações da matriz **nunca foram geradas**: `org-entardecer` com `blob`, e
`amanhecer` com a paleta `amanhecer` em `blob` (o `40` usa `org-claro` com o céu
do amanhecer). E a paleta `org-entardecer` aparece **uma vez só**, no `35`.

#### `TABBAR` e `TABCSS` (`pecas.py:4-18`)

Versão do `_tabbar.html` parametrizada por `str.format` em vez de variáveis CSS:
os mesmos cinco traçados, com `class="on"` no Início e `style="color:{c2..c5}"`
nos outros quatro. O CSS puxa `{bg}` para o fundo, `{line}` para o filete,
`{faint}` para o rótulo e `{accent}` para a aba ativa (`pecas.py:12-18`).

---

### 32.8 O veredito: por que Papel e Orgânico venceram

A decisão está registrada no código, não só na documentação:

> *"O dono viu quarenta esboços e escolheu duas identidades — **Papel** e
> **Orgânico** — e decidiu que as duas ficam, com claro e escuro, trocáveis nos
> ajustes. Não é indecisão: são dois negócios diferentes olhando a mesma tela. A
> fábrica que mostra o app para o contador quer a página impressa; a que abre o
> celular na doca às seis da manhã quer a paisagem."*
> (`src/theme/tokens.ts:193-198`)

É a fundação "**depende vira dado, nunca código — e nunca uma pergunta**"
aplicada à identidade visual: em vez de escolher entre Papel e Orgânico, os dois
existem e a empresa escolhe.

**O que muda entre as duas identidades, e o que não muda**
(`src/theme/tokens.ts:199-205`): mudam a **paleta**, a **família tipográfica**, o
**raio dos cantos** e o **cabeçalho** (a linha de traço fino contra a colina
desenhada). **Não muda a escala de tamanhos** — corpo 17, herói 56 e figura 28
são iguais nas duas, *"porque essa escala não é estilo — é o tamanho que se lê
numa câmara fria, de luva, com a tela suja, e trocar isso por gosto seria trocar
legibilidade por decoração"*.

As seis identidades derrotadas e o que cada eliminação registrou:

| identidade | quando caiu | motivo registrado |
|---|---|---|
| Aurora (01) | corte do dono após a 1ª rodada | não citada entre as cinco sobreviventes (`docs/esbocos/README.md:44-45`) |
| Anéis (03) | corte do dono após a 1ª rodada | idem |
| Vitrine (04) | corte do dono após a 1ª rodada | idem |
| Brinquedo (07) | corte do dono após a 1ª rodada | idem |
| Galeria (10) | corte do dono após a 1ª rodada | idem |
| Suíço (06 → 17/18/19) | corte após a 2ª rodada | não escolhida entre as três finalistas; a crítica declarada da rodada foi *"sem ser tão monocromático"* (`docs/esbocos/README.md:46-47`) |
| Terminal (09 → 23/24/25) | corte após a 2ª rodada | idem |
| Vidro (05 → 14/15/16) | corte após a 2ª rodada | idem — **NÃO ESTÁ NO CÓDIGO** um motivo específico para o Vidro |

**NÃO ESTÁ NO CÓDIGO** nenhum registro do dono explicando por que cortou Aurora,
Anéis, Vitrine, Brinquedo e Galeria individualmente; o único registro é a lista
dos cinco que ficaram.

---

### 32.9 A linguagem visual final — `docs/linguagem.md`

165 linhas. *"Por que este arquivo existe.** A capa foi redesenhada primeiro e
sozinha. O dono navegou para a segunda tela e disse o que viu: *'os temas antigo
e os novos estão se sobrepondo'*. Não era bug de tema — era **uma tela nova e
vinte antigas**, e a costura entre elas é o que parece dois aplicativos"*
(`docs/linguagem.md:3-6`).

*"Este arquivo é o que impede que a correção disso produza vinte dialetos. O que
está aqui é **descrição do que a capa já faz**, não invenção: cada regra abaixo
aponta para o código que a executa hoje"* (`docs/linguagem.md:8-10`).

#### A ordem que vem antes de todas (`docs/linguagem.md:17-27`)

**Destrói-se o layout antigo para pôr o novo por cima.** Nunca se acrescenta um
caminho novo ao lado do velho.

*"Isto é decisão do dono, dita depois de o erro acontecer: a cena do céu ganhou
um **ramo** para o Papel em vez de ser substituída, e o resultado foi um gradiente
do Orgânico aparecendo dentro do Papel. Dois caminhos vivos para a mesma coisa
sempre acabam com os dois na tela."*

Converter uma tela é **reescrever o corpo dela**, não embrulhar o que existia.

#### A anatomia de uma tela, na ordem em que o olho encontra (`docs/linguagem.md:31-49`)

1. **`CollapsingHeader`** com `title` e `overline`. O título é o assunto em duas
   ou três palavras; a sobrelinha é o que a tela responde, em caixa alta e uma
   linha só — *"ela é truncada, então nada que importe mora nela"*.
2. **`AreaProvider area="…"`** envolvendo a tela inteira. É de onde sai o
   `accent`, e é o que faz a aba, o cabeçalho e os cartões concordarem.
3. **Cascata de `Reveal index={n}`**, um por bloco, começando em 0 e sem pular
   número. *"É a entrada: sobe catorze pixels e aparece, quarenta milissegundos
   entre um e o próximo. Movimento nunca atrasa informação — a leitura de tela
   recebe tudo montado no primeiro quadro."*
4. **`Card` com `hue` + `icon` + `title`** para cada assunto. *"Fundo lavado de 8
   a 13% do tom, borda inteira na mesma cor, trilho à esquerda mais forte. Um
   `title` sem `icon` não compila: o cabeçalho do cartão só existe com o crachá."*
5. **A ação provável, embaixo.** *"Um `Button` primário só; o resto é fantasma.
   Corrigir, apagar e estornar são sempre fantasma — botão grande e colorido
   convida, e ninguém deve ser convidado a desfazer."*

#### As duas famílias de desenho (`docs/linguagem.md:51-60`)

| família | arquivo | construção | onde |
|---|---|---|---|
| **`Glyph*`** | `src/components/Glyph.tsx` | duas camadas: massa preenchida em opacidade baixa e traço por cima | crachá do cartão, assunto de uma linha grande — `size={26}` |
| **`Icon*`** | `src/components/icons.tsx` | traço fino de **1,6 numa grade de 24** | barra de abas, chevron, ícone de linha de lista — `size={18}` a `26` |

*"Trocar as duas é o erro que o dono já apontou: glifo gordo na barra de abas
vira fileira de manchas; ícone fino como crachá some dentro do círculo pastel."*

#### A espessura é da identidade, não do ícone (`docs/linguagem.md:62-72`)

```tsx
const { skin } = useTheme();
const traco = skin === 'papel' ? 1.7 : 2.2;
// …
icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
```

*"Abaixo de 2 a massa some sozinha (`massIf`): o Papel é só linha, e é assim que
ele foi escolhido."*

Confirmado no código: `src/home/Mosaic.tsx:56` tem exatamente
`const traco = skin === 'papel' ? 1.7 : 2.2;`, com o comentário *"A espessura do
traço é da identidade: fino no Papel, cheio no Orgânico"*
(`src/home/Mosaic.tsx:55`). O corte está em `src/components/Glyph.tsx:63-69`:
*"Abaixo de 2, o glifo é só linha"*.

#### A cor (`docs/linguagem.md:74-92`)

*"Toda cor sai de `useTheme()`. Nenhuma tela escreve hexadecimal — a única
exceção registrada é a etiqueta do lote, que é papel branco com tinta preta em
qualquer tema porque é o que sai da impressora."*

*"O `hue` de um cartão é o tom do **assunto**, e o assunto tem tom fixo em todo o
aplicativo, que é o mesmo da aba correspondente"* (`docs/linguagem.md:83-90`):

| assunto | tom |
|---|---|
| produção, tacho, lote | `palette.apricot` |
| transporte, caixa, remessa | `palette.lilac` |
| insumo, estoque, almoxarifado | `palette.mint` |
| pedido, cliente, acordo | `palette.sage` |
| dinheiro, custo, preço | `palette.sky` |
| perda, vencimento | `color.danger` / `color.warning` |

*"Quem vê laranja sabe que é produção antes de ler."*

#### O desenho respira (`docs/linguagem.md:94-115`)

*"Todo crachá de cartão entra pelo `Alive` (`src/components/Alive.tsx`), e o
`Card` faz isso sozinho — quem usa `icon` não precisa saber. Glifo solto dentro
de uma tela recebe o `Alive` na mão."*

São **dois** movimentos, na mesma medida da cena da fábrica:

- **a chegada**, que assenta na mola `settle` com o mesmo escalonamento de
  quarenta milissegundos do `Reveal` — o crachá termina de se montar junto com o
  cartão que o carrega;
- **a respiração**, **três centésimos e meio de escala para cada lado** em
  `motion.breatheMs`. *"Em vinte e seis pixels isso é menos de um pixel de
  viagem."*

*"É a generalização das duas exceções admitidas na cena da fábrica (o sol e o
floco giram porque um sol parado lê como imagem quebrada): um símbolo inerte no
meio de uma página que se monta lê como carimbo colado. **A barra de abas fica de
fora** — uma barra que respira é ruído, e ali o ícone é orientação, não assunto."*

*"`Reduzir movimento` apaga os dois e o desenho continua inteiro."*

Números exatos, do código (`src/theme/tokens.ts:177-185`):

| token | valor |
|---|---|
| `settle` | `{ damping: 18, stiffness: 140, mass: 1 }` |
| `press` | `{ damping: 20, stiffness: 400, mass: 0.6 }` |
| `pressScale` | `0.97` |
| `staggerMs` | `40` |
| `pulseMs` | `2600` |
| `breatheMs` | `3200` |
| `countMs` | `1250` |

E as cinco regras de movimento, transcritas de `src/theme/tokens.ts:168-176`:
1. nada pisca — pulsos rodam 2,6–3,2 s; 2. no máximo dois elementos pulsando por
tela; 3. só o que está de fato ao vivo pode pulsar; 4. movimento nunca atrasa
informação; 5. reduzir movimento desliga tudo e a tela fica completa.

A transformação exata do `Reveal`:
`transform: [{ translateY: (1 - shown.value) * 14 }]`
(`src/components/Reveal.tsx:73`), disparada por
`withDelay(index * motion.staggerMs, withSpring(1, motion.settle))`
(`src/components/Reveal.tsx:63`). A do `Alive`:
`transform: [{ scale: 0.84 + entrada.value * 0.16 + folego.value * 0.035 }]`
(`src/components/Alive.tsx:83`) — entra de 0,84 e respira ±0,035.

#### As cenas (`docs/linguagem.md:117-124`)

*"Cena é ilustração larga no topo de um cartão (`Landscape`, `FactoryScene`,
`SkyScene`). **Elas se ganham, não se distribuem.** Uma tela tem cena quando o
desenho *responde alguma coisa* — a paisagem da capa é a previsão de verdade, a
linha de produção mostra o tacho rodando e a caixa enchendo. Cena que só enfeita
é o mesmo defeito do alerta inventado: ensina a ignorar."*

**Nota factual:** o nome `SkyScene` citado aqui não existe como componente; o
arquivo é `src/components/Sky.tsx`, e os símbolos exportados usados pela capa são
`SkyMark`, `skyInk` e `TemperatureRange` (`src/home/Mosaic.tsx:13`).
`src/language.test.ts:28` reconhece a família por `Sky`, não por `SkyScene`.

#### Números (`docs/linguagem.md:126-131`)

*"Toda figura grande responde com o que se compara ao lado — Lei 3, e
`src/law.test.ts` conta uma declaração por número. Contagem regressiva compara
com o próprio limite; estado ao vivo responde 'o que está diferente agora'; e
quando não há o que comparar, o motivo fica escrito."*

#### Estado vazio (`docs/linguagem.md:133-137`)

*"Não é uma frase cinza no meio da tela. É **desenho + uma frase + a próxima
ação** — 'está tudo bem' é estado válido e bonito, e uma tela vazia é a primeira
coisa que todo mundo vê no primeiro dia."*

#### O que não fazer — lista integral (`docs/linguagem.md:139-165`)

- **Ícone em toda linha de lista:** vira papel de parede e some. (Note que isto
  **contradiz** o que o esboço `11` propôs — "ícone em cada linha" — e o que o
  gerador implementou em `lista()`.)
- **Animação que não é entrada nem resposta a toque.**
- **Cartão colorido chapado:** o acordo é **fundo lavado**, *"porque tela colorida
  cansa quem olha oito horas"*. (Isto elimina explicitamente o vocabulário do
  esboço `13-papel-c` e da faixa chapada do `18-suico-b`.)
- **Chave de dicionário nova quando já existe uma que diz o mesmo.** *"Quatro
  seções inteiras deste dicionário existiram nos três idiomas sem uma tela
  lendo."*
- **E o inverso: chave de outra tela quando ela nomeia outra grandeza.** *"A aba
  de transporte encabeçava a contagem de DESTINOS com `home.boxesTitle` — 'Saiu
  para as lojas' —, que na capa rotula uma contagem de CAIXAS, enquanto o
  comentário da própria aba dizia 'conta destinos, não caixas'. Frase
  compartilhada de verdade (o convite de abrir, a palavra de plural) se empresta;
  rótulo que nomeia um número, não."*
- **Rótulo fixo em cima de cartão que muda de assunto.** Três exemplos escritos:
  "ENTRA NA RECEITA COMO" sobre material de loja, que não entra em receita
  nenhuma; "Novo insumo" no cabeçalho com "Embalagem" aceso a um dedo de
  distância; "Registrar a transferência" no botão que grava uma devolução. *"Se o
  cartão muda de assunto no toque, o rótulo muda com ele."*
- **Selo de dois estados sobre um fato de três.** *"`delta >= 0` fazia o empate
  imprimir '0% acima de ontem' com 480 e 480 na mesma tela. Empate é estado, e
  'está tudo bem' é estado válido e bonito (Lei 7)."*
- **Promessa dita fora do estado em que ela é verdade.** *"'Conte e escreva aqui —
  o número que o sistema espera fica escondido' ficava na tela **fechada**, com o
  número uma linha acima e nenhum campo para escrever: a tela lia a lei e mostrava
  a infração no mesmo cartão."*
- **Frase escrita na tela.** Tudo vem de `src/i18n/locales/`, nos três idiomas.

#### A guarda que mede a linguagem — `src/language.test.ts`

*"A guarda que mede isto é `src/language.test.ts`, e ela tem a lista das telas
que ainda faltam. A lista só encolhe"* (`docs/linguagem.md:12-13`).

Quatro testes mecânicos, *"e as três [regras] são mecânicas de propósito — gosto
não se testa, mas 'esta tela não tem desenho nenhum' se conta"*
(`src/language.test.ts:23-25`):

| constante | valor exato | função |
|---|---|---|
| `DESENHO` | `/from '@\/components\/(Glyph\|icons\|Sky\|Landscape\|FactoryScene)'/` | o que conta como desenho: as duas famílias e as cenas (`:28`) |
| `ANIMACAO` | `/\bReveal\b/` | a entrada animada (`:31`) |
| `HEX` | `/#[0-9a-fA-F]{6}\b/g` | cor crua na tela (`:63`) |
| `DELEGAM` | `{ 'app/(tabs)/index.tsx': 'src/home/Mosaic.tsx' }` | telas que delegam a tela inteira (`:39-41`) |
| `FALTAM` | `new Set<string>([])` | **vazia desde 4 de setembro** (`:55`) |
| `TINTA_PROPRIA` | `{ 'app/lots/[id].tsx': 'a etiqueta é papel branco com tinta preta em qualquer tema, porque é o que sai da impressora — o tema da tela não muda a cor da tinta.' }` | a única exceção de hexadecimal (`:66-69`) |

Os quatro nomes de teste, literais:

1. `every screen draws something - no screen is a wall of paragraphs`
   (`src/language.test.ts:88`);
2. `every screen comes in animated, like the cover does` (`:104`);
3. `no screen invents a colour` (`:118`);
4. `the pending list only shrinks, and never outlives the screens` (`:133`).

A lista `FALTAM` *"começou com vinte e três telas e chegou a zero"*, e fica
vazia de propósito: *"**Vazia ela vale mais que cheia**... Acrescentar um nome
aqui é declarar que uma tela do aplicativo está fora da língua — o que precisa de
motivo escrito, como tudo mais"* (`src/language.test.ts:44-53`). O teste 3 exige
que o motivo tenha mais de 40 caracteres: `assert.ok(motivo.length > 40, ...)`
(`src/language.test.ts:129`).

---

### 32.10 Como os esboços viraram código — a herança verificada

#### As duas identidades, em `src/theme/tokens.ts`

```ts
export type Skin = 'papel' | 'organico';   // linha 206
export const skins = {                      // linha 386
  papel:    { light: papelClaro,    dark: papelEscuro,    titleFamily: 'serif',    radius: { sm: 4,  md: 6,  lg: 8,  xl: 10, pill: 999 } },
  organico: { light: organicoClaro, dark: organicoEscuro, titleFamily: undefined,  radius: { sm: 12, md: 18, lg: 22, xl: 28, pill: 999 } },
} as const;
```

(`src/theme/tokens.ts:386-399`). O raio é o que o esboço já dizia: canto quase
reto no Papel (4–10) contra canto generoso no Orgânico (12–28) — o `3px` do
`13-papel-c` e o `border-radius:32px` do `20-organico-a` levados a token.

A tipografia: *"`serif` no Papel e nulo no Orgânico — nulo quer dizer 'a fonte do
sistema'... `serif` é o nome genérico que Android e iOS resolvem sozinhos, sem
embarcar arquivo de fonte: um aplicativo que abre offline numa câmara fria não
paga megabytes por uma família de texto"* (`src/theme/tokens.ts:355-363`). É a
mesma restrição do briefing ("sem fonte externa"), agora por outro motivo.

#### As paletas: o que sobreviveu literalmente e o que foi revisado

**Orgânico: herança literal.** A paleta `org-claro` do gerador
(`pecas.py:28-30`) e a `organicoClaro` do aplicativo
(`src/theme/tokens.ts:302-326`) são a mesma:

| chave do esboço | valor | chave do app | valor |
|---|---|---|---|
| `bg` | `#f3f7f3` | `paper` | `#F3F7F3` |
| `surface` | `#ffffff` | `surface` | `#FFFFFF` |
| `ink` | `#16281d` | `ink` | `#16281D` |
| `line` | `#dde9df` | `line` | `#DDE9DF` |
| `accent` | `#2f7d5c` | `mint` / `ok` | `#2F7D5C` |
| `cool` | `#5b8ec9` | `sky` | `#5B8EC9` |
| `c2` | `#e29b52` | `apricot` | `#E29B52` |
| `c3` | `#6b7fd0` | `lilac` | `#6B7FD0` |
| `c4` | `#b28e42` | `sand` | `#B28E42` |
| `c5` | `#8ba192` | `mist` | `#8BA192` |
| `muted` | `#4d6055` | `neutral` | `#4D6055` |
| `warn` | `#c2751f` | `warning` | `#C2751F` |

Mesma coisa com `noite` → `organicoEscuro`: `#0c1512`/`#13201b`/`#eaf5ee`/
`#9db8a9`/`#1c2f27`/`#5ef2a8`/`#7fb6e8`/`#e5c377`/`#7f9a8c`/`#f5a35e` reaparecem
todos (`pecas.py:34-36` contra `src/theme/tokens.ts:328-352`).

**Papel: revisado depois da crítica do dono.** O esboço tinha `line:#e2dbd0`,
`accent:#b4552d`, `cool:#6f8188`; o aplicativo tem `line:#DCD3C6`,
`apricot:#A8371A`, `sky:#2C5A7A`. O motivo está escrito no código
(`src/theme/tokens.ts:209-220`): *"A primeira versão era terrosa e discreta — e
discrição, na tela dele, virou apagamento: 'está muito apagado, quero mais
contraste entre os elementos coloridos'. O que mudou foi só a **saturação dos
tons de área**; o creme, a tinta e a serifa continuam iguais, porque o que ele
gostou foi exatamente isso."*

E o `#B4552D` do esboço não morreu: virou
`hues.terracota.brand` (`src/theme/tokens.ts:382`).

**O `line:#2f271f` do `papel-escuro` é o defeito nomeado.** O docblock do
`papelEscuro` diz: *"Enquanto os cartões tinham fundo lavado, a massa deles
separava a página do chão; no dia em que a caixa saiu (que é o que este tema
pede), sobrou tudo boiando num preto quase puro, **com réguas de `#2F271F` que
ninguém enxerga**"* (`src/theme/tokens.ts:262-271`). A correção subiu o chão de
`#15110D` para `#1B1610` e a régua de `#2F271F` para `#4A3F33`
(`src/theme/tokens.ts:273-290`) — o esboço é a origem documentada do bug.

#### A paisagem do gerador virou o `Landscape` do aplicativo, traço por traço

| elemento | `gerador/pecas.py` | `src/components/Landscape.tsx` |
|---|---|---|
| colina de trás | `M0 150c70-22 120 14 206 2s136-30 206-12v70H0z` (`:107`) | idêntico (`:131`) |
| galpão | `M282 156h60v30h-60z` (`:99`) | idêntico (`:135`) |
| dentes de serra | `M282 156l10-15 10 15 10-15 10 15 10-15 10 15` (`:99`) | idêntico (`:136`) |
| chaminé | `rect x=348 y=132 9×54` (`:100`) | idêntico (`:137`) |
| três janelas | `rect 290/304/318, y=166, 8×8` (`:101`) | idêntico (`:140-142`) |
| colina da frente | `M0 182c80-16 130 12 206 4s130-22 206-6v34H0z` (`:109`) | idêntico (`:145`) |
| sol | `fill="#ffd76a"` (`:74`) | `#FFD76A` no claro (`:153`) |

E as cores do momento `dia` (`ceu_a #dff0e6`, `ceu_b #bfe3cf`, `colina_a
#a9dcc0`, `colina_b #7cc9a6`) são exatamente
`hues.verde = { skyTop: '#DFF0E6', skyBottom: '#BFE3CF', hillFar: '#A9DCC0',
hillNear: '#7CC9A6' }` (`src/theme/tokens.ts:379`).

**O que o aplicativo acrescentou por cima do esboço:** as cinco matizes de
paisagem (`verde`, `azul`, `ambar`, `terracota`, `lavanda` —
`src/theme/tokens.ts:376-384`), com a justificativa escrita: *"'A paleta é bem
verde; seria legal poder escolher' — e a escolha não é um botão de cor: ela move
a **paisagem inteira**, porque no Orgânico o céu e a colina são a identidade, não
decoração de fundo"* (`src/theme/tokens.ts:365-372`). O que a escolha **não**
move são os sinais: `ok`, `warning` e `danger` ficam fora
(`src/theme/tokens.ts:373-375`).

E a função `noturno(hex, fator)` (`src/components/Landscape.tsx:46-51`), que
multiplica cada canal RGB por um fator, resolvendo o escuro por escurecimento da
matiz escolhida em vez de por troca para cinza: `hillFar × 0.42`,
`hillNear × 0.72`, `skyBottom × 0.30` e a segunda colina `× 0.58`
(`src/components/Landscape.tsx:125,132,134,146`).

#### A cena da fábrica do esboço `11` virou o `FactoryScene`

| elemento | esboço `11-papel-a.html` / `pecas.py` | `src/components/FactoryScene.tsx` | mudança |
|---|---|---|---|
| chão | `M0 133h364` | idêntico (`:113`) | — |
| telhado dente-de-serra | `M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16` | idêntico (`:114`) | — |
| galpão | `M20 88h64v45H20z` | idêntico (`:115`) | — |
| janelas | `M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z` | idêntico (`:116`) | — |
| porta | `M56 133v-23h12v23` | idêntico (`:117`) | — |
| chaminé | `M92 133V58h14v75M90 62h18` | idêntico (`:119`) | — |
| câmara fria | `M124 76h54v57h-54z` + `M124 96h54M168 84v8M168 102v12` | idêntico (`:121-122`) | — |
| floco | `M151 49v18M143 53.5l16 9M143 62.5l16-9` | `M151 105v18M143 109.5l16 9M143 118.5l16-9` (`:125`) | **desceu 56px, para dentro da câmara** |
| picolés | três `rect` 20×34 `rx=7` em 192/216/240, y=82, com palito | três `rect` **15×47 `rx=2.5`** em 194/218/242, y=86, com **aro** `M…92h18` e prateleira `M188 133h75` (`:139-146`) | **viraram potes**, e o palito virou a linha da prateleira |
| preenchimento do pote do meio | estático (`fill-opacity=".16"`) | animado: `y = 133 - 39·progress`, `height = 39·progress`, `fillOpacity 0.22` (`:201-212`) | **virou medidor** |
| fumaça | `M99 52c-7-5 5-11-2-17c-5-5 3-9 0-13` | `M15 38c-7-5 5-11-2-17c-5-5 3-9 0-13` numa `View` própria de 30×40 (`:259-271`) | **saiu do SVG para animar igual nas 3 plataformas** |
| caixa | `M312 104h44v29h-44z` + `M312 113h44M334 104v29` + `M318 104l6-8h26l6 8` | `M2 8h44v26H2zM2 17h44M24 8v26M8 8l6-7h26l6 7` numa `View` de 50×36 (`:225-233`) | rebase de coordenadas; entra pela direita quando saiu carga |
| sol | `circle cx=336 cy=30 r=11` + oito raios | `circle cx=31 cy=31 r=11` + oito raios, numa `View` de 62×62 girando (`:168-175`) | **saiu do SVG para girar** |
| morango | `M290 122c-14-9-18-22-9-27…` + coroa | **removido** | ver abaixo |
| nuvem | `M28 34c-5 0-8-3-8-7…` | **removida** | ver abaixo |

O motivo dos dois removidos está escrito
(`src/components/FactoryScene.tsx:43-56`): *"O dono abriu o aplicativo instalado e
a cena tinha oito grupos em trezentos pixels... **o morango e a nuvem não pousavam
em nada**. Objeto solto no ar, sem linha de base e sem função, é o que transforma
desenho em figurinha espalhada."* E o do floco: *"**o floco flutuava ACIMA da
câmara**, e lia como um asterisco azul no céu — um símbolo sem dono. Ele entrou
para dentro do retângulo, que é o que ele existe para nomear."* Ambos foram vistos
**olhando a tela renderizada**, não lendo o código.

O motivo dos picolés virarem potes (`src/components/FactoryScene.tsx:128-138`):
*"e eles eram três **PICOLÉS**. A primeira linha deste projeto diz 'nada de regra
chumbada de sorvete', e o sorvete estava no maior desenho da capa, numa fábrica
que pode ser de queijo, tinta ou cosmético. O ícone da aba saiu primeiro; este
ficou, porque a cena parecia intocável."*

Os quatro movimentos da cena, e o que cada um responde
(`src/components/FactoryScene.tsx:26-41`): a **fumaça** sobe quando há tacho
aberto (fábrica parada, chaminé parada); o **pote do meio** enche na proporção do
dia contra ontem (*"enche até embaixo da TAMPA, não até a borda: pote cheio até a
tampa é pote transbordando"* — `:206-207`); a **caixa** entra pela direita quando
saiu carga hoje e some quando não saiu nada (*"a ausência é dado"*); o **sol** e o
**floco** giram, e *"esses dois são os únicos decorativos: um sol parado num
desenho de céu lê como imagem quebrada"*. Os ciclos são de seis a quarenta e oito
segundos, *"movimento que se percebe se você olhar e não se percebe se você
estiver trabalhando"*.

#### A barra de abas: quatro ícones idênticos e um trocado

| aba | esboço (`_tabbar.html`) | app (`src/components/icons.tsx`) | veredito |
|---|---|---|---|
| Início | `M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z` | idêntico (`:56`) | **igual** |
| Produção | `rect x=6 y=2.5 12×14 rx=6` + `M12 16.5v5` (**picolé**) | `rect x=5 y=3.5 10×9 rx=2.2` + `M4 16.5h13.5` + `M17 13.8l2.7 2.7-2.7 2.7` (**caixa na esteira com flecha**) (`:65-67`) | **trocado** |
| Transporte | `M2 7.5h11v9H2z` + `M13 11h4l3.5 3.5v2H13z` + duas rodas `r=1.9` | idêntico (`:76-79`) | **igual** |
| Relatórios | `M4 20h16` + `M6.5 20v-6` + `M12 20V5` + `M17.5 20v-9` | idêntico (`:88-91`) | **igual** |
| Mais | quatro `rect` 7×7 `rx=2` | idêntico (`:100-103`) | **igual** |

A troca do ícone de Produção é a aplicação direta da primeira linha do
`CLAUDE.md` ("nada de regra chumbada de sorvete") a um desenho que os quarenta
esboços tinham por padrão. O comentário no app é *"Produção — a unidade saindo
pela esteira: o que a fábrica pôs para fora"* (`src/components/icons.tsx:61`).

As duas regras que `icons.tsx` declara e obedece
(`src/components/icons.tsx:11-15`): *"a cor mora SÓ no traço — nenhuma superfície
preenchida, nunca"*, e *"o traço é 1,6px em 24px, escalado com o tamanho"* via
`const GRID = 24` (`:25`) e um viewBox que faz o escalonamento (`:36-41`).

#### Os crachás do `04-vitrine` viraram a família `Glyph*`

A construção de duas camadas que o `04-vitrine.html:42-48` inventou (massa em
`opacity:.25`–`.3` + traço de 2,2) é literalmente a receita de `Glyph.tsx`:

```ts
const line = (color: string, width = 2.2) => ({ stroke: color, strokeWidth: width, strokeLinecap:'round', strokeLinejoin:'round', fill:'none' });
const mass = (color: string, opacity = 0.24) => ({ fill: color, opacity });
```

(`src/components/Glyph.tsx:53-61`), numa grade de 32 (`viewBox: '0 0 32 32'` —
`:50`), com `size = 26` e `weight = 2.2` como padrão em todos os 26 glifos.

A família cresceu de seis para vinte e seis: `GlyphProduction`, `GlyphStock`,
`GlyphBox`, `GlyphPrice`, `GlyphOrder`, `GlyphKettle`, `GlyphStore`,
`GlyphFactory`, `GlyphVehicle`, `GlyphCustomer`, `GlyphSack`, `GlyphBucket`,
`GlyphPackaging`, `GlyphStick`, `GlyphRecipe`, `GlyphPurchase`, `GlyphLabel`,
`GlyphCalendar`, `GlyphLoss`, `GlyphCount`, `GlyphChart`, `GlyphThermometer`,
`GlyphSettings`, `GlyphAssistant`, `GlyphCatalog`, `GlyphPlus`
(`src/components/Glyph.tsx:101-440`). O motivo do crescimento:
*"as vinte telas que não são a capa não tinham desenho nenhum, 'sem ícone, sem
faixa de cor, sem cena', e navegar da capa para elas parecia dois aplicativos"*
(`src/components/Glyph.tsx:20-25`). Dois glifos voltaram para a prancheta na
primeira revisão: *"a embalagem tinha virado ampulheta e o palito perdia a haste
do meio"* (`:27-29`).

#### O cartão: o Orgânico tem caixa, o Papel não

O `Card` bifurca por `skin` (`src/components/Card.tsx:114-145`):

| | Papel | Orgânico |
|---|---|---|
| fundo | `transparent` | `tint(hue, wash)` |
| raio | `0` | `radius.xl` |
| bordas | só a de cima | as quatro |
| régua | `borderTopWidth: toneColor ? 1.5 : hairline`, na cor do assunto | `borderLeftWidth: RAIL_WIDTH` (3px) |
| padding | vertical só (`paddingHorizontal: 0`) | `space.lg` nos quatro lados |
| crachá do ícone | **nenhum** — o desenho fica na página | `View` com `tint(hue, 0.14/0.22)` e `radius.lg` |

`wash = scheme === 'dark' ? 0.13 : 0.08` e
`edge = scheme === 'dark' ? 0.34 : 0.24` (`src/components/Card.tsx:94-95`) —
que é o "fundo lavado de 8 a 13%" que `docs/linguagem.md:44-46` declara. O
comentário explica o assimetrismo: *"O escuro aguenta mais cor que o claro: sobre
papel quase branco, doze por cento de âmbar já vira um cartão amarelo"*
(`:92-93`).

E o motivo do Papel não ter caixa, na voz do dono
(`src/components/Card.tsx:98-112`): *"as cores e todo o resto não combinam. como
é que essas 'caixas' continuam aí?"* — *"e ele estava apontando para três coisas
de uma vez — o retângulo de canto arredondado, o fundo lavado de cor e o crachá
preenchido atrás do ícone. As três são vocabulário do Orgânico... A forma do
Papel é editorial: **régua em cima, sem fundo, sem borda em volta, sem crachá.**"*
Isso é o `02-papel.html` e o `11-papel-a.html` chegando ao código: a régua de 1px
`#e2dbd0` e o espaço em vez do retângulo.

O `Chip` faz a mesma bifurcação: `borderRadius: papel ? radius.sm : radius.pill`
— *"A pílula é do Orgânico; no Papel a etiqueta é reta, como um carimbo"*
(`src/components/Chip.tsx:21-31`).

O `CollapsingHeader` também:
`skin === 'papel' ? <Mark size={18} color={accent} /> : <View style={{backgroundColor: accent+'22', borderRadius: 9}}><Mark size={15}/></View>` —
*"No Papel a marca fica na página, sem selo atrás — o dono circulou justamente as
'caixinhas' e esta era uma delas"* (`src/components/CollapsingHeader.tsx:73-81`).

#### As barras da semana

`src/components/Bars.tsx` implementa o gráfico de sete colunas, mas com uma
mudança de fundamento em relação a todos os quarenta esboços: *"A altura é
relativa **ao maior dia da própria semana**, não a uma meta: fábrica nenhuma tem
meta cadastrada aqui, e inventar uma régua para o desenho ficar bonito seria
número que ninguém pode conferir"* (`src/components/Bars.tsx:21-25`). Nos esboços
as sete alturas eram literais (38/44/41/6/82/46/64%).

E a coluna de dia parado ficou: *"Coluna de dia parado é um risco, não um vazio:
zero é um fato sobre a fábrica, e some-lo do desenho contaria uma semana que não
aconteceu"* (`src/components/Bars.tsx:27-29`) — o domingo de 6% do briefing virou
um princípio.

#### O bloco de céu que os esboços sugeriram e o aplicativo recusou

O docblock de `src/components/Sky.tsx:14-46` conta uma tentativa que nasceu dos
esboços e falhou: *"A primeira resposta foi uma FAIXA de céu: um retângulo de 140
px com degradê entre duas cores da paleta, o sol por cima, e o texto embaixo. Ela
nasceu do argumento certo — numa fábrica de sorvete o calor É o negócio — e
resolveu o problema errado."* Os três defeitos fotografados: no Orgânico claro a
33° *"duas cores de matiz distante interpoladas em sRGB passam por LAMA no meio:
o cartão ficou um hematoma de 140 px no alto da capa"*; no Orgânico escuro *"um
adesivo de outro aplicativo colado na tela"*; no Papel *"sobrava um VAZIO de 92 px
com um sol no canto direito"*.

*"O defeito comum não é a cor escolhida: é a **área**. As cores desta paleta são
tinta e traço — feitas para desenhar sobre um fundo claro ou escuro, não para
PREENCHER um terço da tela."* O que ficou foi *"o desenho, do tamanho de um
desenho, ao lado do número"* — o `SkyMark` de 76px
(`src/components/Sky.tsx:93-209`), que é a solução do `11-papel-a` (sol em traço
de 78px ao lado do texto) e não a do `04-vitrine` (herói de 290px).

---

### 32.11 O que dos esboços NÃO foi levado para o aplicativo

Tudo abaixo foi verificado por busca no código-fonte (`src/`, `app/`) na data
deste dossiê.

#### Identidades inteiras — planejado/explorado apenas, nunca implementado

| identidade | esboços | estado |
|---|---|---|
| Aurora | `01` | **NÃO IMPLEMENTADO**. Nenhum `filter:blur`, nenhum texto com degradê, nenhum `background-clip:text` no aplicativo. |
| Anéis | `03` | **NÃO IMPLEMENTADO**. Nenhum anel de progresso (`stroke-dasharray` de círculo) no aplicativo. |
| Vitrine | `04` | **NÃO IMPLEMENTADO** como identidade. Só a construção de duas camadas dos crachás sobreviveu, na família `Glyph*`. |
| Vidro | `05`, `14`, `15`, `16` | **NÃO IMPLEMENTADO**. `grep -rn "glass\|vidro\|backdrop" src/` não devolve nada. Nem `backdrop-filter`, nem painéis translúcidos, nem fundo de manchas. |
| Suíço | `06`, `17`, `18`, `19` | **NÃO IMPLEMENTADO**. Nenhuma régua de 3–7px, nenhum acento vermelho único, nenhum pictograma geométrico, nenhuma faixa chapada de largura inteira. |
| Brinquedo | `07` | **NÃO IMPLEMENTADO**, e é o único que o `CLAUDE.md` proíbe por outra via: emoji na tela. Nenhum emoji no aplicativo. |
| Terminal | `09`, `23`, `24`, `25` | **NÃO IMPLEMENTADO**. Nenhuma família monoespaçada, nenhum papel milimetrado, nenhum LED, nenhum instrumento. |
| Galeria | `10` | **NÃO IMPLEMENTADO**. Nenhuma faixa horizontal de cartões altos que deslizam. |

#### Elementos e mecanismos específicos

| item | onde estava no esboço | estado no aplicativo |
|---|---|---|
| **Botão "Lançar produção" na capa** | os dez de `01` a `10` | **REMOVIDO por decisão do dono**, já na 2ª rodada (`docs/esbocos/_briefing.md:25-26`). Não existe no aplicativo. |
| **Barra de abas de texto puro** | os dez de `01` a `10` (`.tab`) | **CORRIGIDO na 2ª rodada.** O aplicativo sempre teve ícones. |
| **A palavra "NORVA" escrita na capa** | os quarenta esboços | **NÃO ESTÁ NA TELA.** O aplicativo usa o `Mark` — *"um disco sólido com um corte de 55 graus apontando para o norte... o **mostrador** da bússola, não a agulha"* (`src/components/Mark.tsx:5-16`) —, e a única ocorrência da string é `src/config/brand.ts:12`. Nenhum esboço tem esse desenho. |
| **A semana como linha ondulada com pontos** | `34`, `38`, `40` (`onda_semana`) | **NÃO IMPLEMENTADO**, e a recomendação escrita é contra: *"barra tem base zero, curva não tem"* (`docs/esbocos/README.md:109-112`). O aplicativo usa `Bars`. |
| **A semana como bolhas de fruta** | `21-organico-b` | **NÃO IMPLEMENTADO.** |
| **A semana como gráfico de área com nós** | `23-terminal-a` | **NÃO IMPLEMENTADO** na capa. Existe um `src/components/Sparkline.tsx` no aplicativo, usado pelo `Mosaic` (`src/home/Mosaic.tsx:5`), mas ele não é o gráfico de área do `23`. |
| **A semana com valores impressos e linha de média** | `19-suico-c` | **NÃO IMPLEMENTADO.** Nenhuma linha de média no gráfico da capa. |
| **Medidor de chance de chuva (barra a 47%)** | `11`, `12`, `13`, `29`–`40` (`.gauge`) | **NÃO IMPLEMENTADO como medidor de chuva.** A barra que existe (`TemperatureRange`, `src/components/Sky.tsx:213-262`) mede o intervalo mínima→máxima numa escala fixa de 0 a 40 °C — *"uma régua que se estica para caber no dado faria 18° e 34° desenharem a mesma barra"* (`:236-238`). |
| **A legenda em itálico embaixo da cena** (`.cap`) | `11-papel-a:97`, `12-papel-b:90`, `29`, `31` | **NÃO IMPLEMENTADO.** `grep -n "fontStyle" src/home/Mosaic.tsx` não devolve legenda de cena. |
| **O layout "vinheta"** (cena pequena ao lado do título) | `30`, `32` | **NÃO IMPLEMENTADO.** A capa usa a cena de largura inteira. |
| **Duas colunas de jornal com fio vertical** | `12-papel-b` | **NÃO IMPLEMENTADO.** |
| **Capitular (`::first-letter` de 54px)** | `12-papel-b:30` | **NÃO IMPLEMENTADO.** |
| **Vinheta emoldurada com legenda** (`.cut`) | `12-papel-b:26-28` | **NÃO IMPLEMENTADO.** |
| **Blocos de cor chapada** | `13-papel-c`, `18-suico-b` | **NÃO IMPLEMENTADO**, e proibido: *"Cartão colorido chapado: o acordo é fundo lavado"* (`docs/linguagem.md:143-145`). |
| **Ícone marca-d'água gigante por painel** (`opacity:.07`–`.11`) | `14`, `15`, `16` | **NÃO IMPLEMENTADO.** |
| **Faixa de alerta com ilustração preenchida de 42px** | `16-vidro-c:174-202` | **NÃO IMPLEMENTADO** nessa forma. |
| **Termômetro desenhado com escala e três referências** | `19-suico-c:105-121`, `25-terminal-c` | **NÃO IMPLEMENTADO.** Existe um `GlyphThermometer` (`src/components/Glyph.tsx:388`) — um glifo de 26px, não um instrumento com escala. |
| **Gota preenchida a 47% por `clip-path`** | `19-suico-c:123-129` | **NÃO IMPLEMENTADO.** |
| **Linha do tempo do insumo (HOJE, +1…+6)** | `19-suico-c:137-157` | **NÃO IMPLEMENTADO.** Existe `src/components/Drain.tsx`, usado pelo `Mosaic` (`src/home/Mosaic.tsx:4`), mas é outro desenho. |
| **Diagrama FÁBRICA → 1 CAIXA → LOJA** | `19-suico-c:163-176` | **NÃO IMPLEMENTADO.** |
| **A conta aberta em nós e setas de Bézier** | `19-suico-c:60-83` | **NÃO IMPLEMENTADO** como desenho. A conta aberta existe como texto, pelo `[por quê?]` (`src/components/WhySheet.tsx`). |
| **O clima flutuando DENTRO da cena** | `20-organico-a:22-31,146-163` | **NÃO IMPLEMENTADO.** O clima é um cartão abaixo da paisagem. |
| **Crachás de linha em silhueta orgânica preenchida de 44px** | `20-organico-a:193-210` | **NÃO IMPLEMENTADO.** Os crachás são `Glyph*` de 26px. |
| **Frutas ilustradas de 24px como marcador de preço** | `20-organico-a:219-245`, `21-organico-b` | **NÃO IMPLEMENTADO** — e é o mesmo caso do picolé: fruta na tela é regra chumbada de sorvete. |
| **Morango ilustrado de 96×104 com degradê e coroa** | `21-organico-b:160-180` | **NÃO IMPLEMENTADO**, pelo mesmo motivo. |
| **Limão geométrico cortado pela borda** | `21-organico-b:93-96` | **NÃO IMPLEMENTADO.** |
| **A lua crescente por máscara SVG** | `22-organico-c:78-81,100-102`; `pecas.py:78-81,93-95` | **NÃO IMPLEMENTADA.** À noite o aplicativo escurece a paisagem e mantém o **sol** em `#F7E6B5` (`src/components/Landscape.tsx:153`). Não há máscara, não há disco crescente. |
| **As estrelas do céu noturno** | `22-organico-c:88-98`; `pecas.py:95` | **NÃO IMPLEMENTADAS.** Nenhuma estrela em `Landscape.tsx`. |
| **As divisórias em forma de onda desenhada** | `22-organico-c:207,231` | **NÃO IMPLEMENTADAS.** |
| **O brilho `feGaussianBlur` na barra de hoje** | `22-organico-c:188-202` | **NÃO IMPLEMENTADO.** |
| **A paleta `org-entardecer`** (`#1b1626` ameixa) | `pecas.py:31-33`, esboço `35` | **NÃO IMPLEMENTADA.** O aplicativo tem dois esquemas (`light`, `dark`) e cinco matizes de paisagem; nenhuma delas é o roxo do entardecer. **Não há um terceiro momento do dia.** |
| **A paleta `amanhecer`** (`#fdf5ef`) | `pecas.py:37-39`, esboços `39`, `40` | **NÃO IMPLEMENTADA** como paleta própria. A lua minguante do amanhecer (`pecas.py:89`) também não. |
| **Três barras de progresso comparáveis com régua compartilhada** | `24-terminal-b:96-105` | **NÃO IMPLEMENTADAS.** |
| **Mostrador de ponteiro, tanque de nível, odômetro** | `24-terminal-b` | **NÃO IMPLEMENTADOS.** |
| **Papel milimetrado em quatro `linear-gradient`** | `25-terminal-c:8-13` | **NÃO IMPLEMENTADO.** |
| **Seções numeradas com selo invertido (01…05)** | `25-terminal-c` | **NÃO IMPLEMENTADAS.** |
| **Trilha de desvio com marca de zero ao centro** | `23`, `24`, `25` | **NÃO IMPLEMENTADA.** |
| **`font-variant-numeric: tabular-nums`** | `09`, `23`, `24`, `25` | **NÃO IMPLEMENTADO** (React Native não expõe a propriedade da mesma forma; não há equivalente no código). |
| **`_base.css`** | referenciado por `01`–`10` | **NÃO EXISTE**, e nunca existiu em commit nenhum. |

#### O que os esboços declararam não conseguir mostrar, e que o aplicativo tem

Três itens de `docs/esbocos/README.md:36-39`, todos **implementados e chamados
por tela**:

| item | onde |
|---|---|
| o cartão que entra escalonado | `src/components/Reveal.tsx` (`translateY 14`, `staggerMs 40`), usado em cascata pelo `Mosaic` (`src/home/Mosaic.tsx:361` e seguintes) |
| o número que afunda quando o dedo encosta | `src/components/Touchable.tsx` com `motion.press` e `motion.pressScale = 0.97` (`src/theme/tokens.ts:179-180`) |
| a transição em que tocar o número *vira* a tela de produção | **NÃO IMPLEMENTADA** como transição compartilhada. O toque navega (`go('/inputs')`, `src/home/Mosaic.tsx:362`), sem elemento compartilhado entre as duas telas. |

---

### 32.12 Divergências observadas entre a documentação e o código

Registradas como observação verificada, sem afirmar qual lado é o certo.

1. **A tabela de tons do assunto "dinheiro/custo/preço".**
   `docs/linguagem.md:89` diz `palette.sky`. O cartão de preços da capa usa
   `hue={palette.sand}` (`src/home/Mosaic.tsx:363`), e `ambientArea` mapeia
   `sand: 'finance'` e `sky: 'home'` (`src/theme/tokens.ts:36,42`).

2. **O item 4 da anatomia de uma tela.** `docs/linguagem.md:44-46` descreve o
   cartão como *"fundo lavado de 8 a 13% do tom, borda inteira na mesma cor,
   trilho à esquerda mais forte"*. Isso é verdade só no Orgânico: no Papel o
   `Card` é `backgroundColor:'transparent'`, `borderRadius:0`, sem borda
   esquerda/direita/inferior e sem crachá (`src/components/Card.tsx:120-136`). O
   arquivo de linguagem não registra a bifurcação.

3. **`SkyScene`.** Citado como componente de cena em `docs/linguagem.md:119`. Não
   existe símbolo com esse nome; o arquivo é `src/components/Sky.tsx` e exporta
   `SkyMark`, `skyInk` e `TemperatureRange`.

4. **"Ícone em toda linha de lista: vira papel de parede e some"**
   (`docs/linguagem.md:141`) contra o que a rodada dois entregou e o dono
   aprovou: *"ícone em cada linha"* era exatamente a proposta do `11-papel-a`
   (`docs/esbocos/README.md:59`), e o gerador implementa três linhas com ícone
   (`gerador/gerar.py:60-73`). A regra final é mais restritiva que o esboço
   escolhido.

5. **A pasta dos esboços.** `docs/esbocos/README.md:9-10` promete que *"os outros
   nove são apagados, junto com esta pasta"*. Os quarenta arquivos e o gerador
   continuam versionados.

---

### 32.13 O que NÃO ESTÁ NO CÓDIGO

- **Capturas de tela dos esboços.** O briefing menciona *"a máquina que fotografa
  não tem internet"* (`docs/esbocos/_briefing.md:4-5`), mas nenhuma imagem foi
  versionada. Não há `.png`, `.jpg` ou `.webp` em `docs/`.
- **O motivo de a numeração pular 26, 27 e 28.**
- **Um registro de qual dos doze da terceira rodada o dono escolheu
  individualmente.** O que existe é a decisão agregada: as **duas famílias**
  ficam, com claro e escuro (`src/theme/tokens.ts:193-198`). Nenhuma linha diz
  "o 29" ou "o 33".
- **O motivo específico do corte do Vidro, do Suíço e do Terminal** entre a 2ª e
  a 3ª rodada. Só há a lista das três escolhidas
  (`docs/esbocos/README.md:84-86`).
- **Um script que regenere `docs/esbocos/29`…`40` no lugar.** `SAIDA` aponta para
  um diretório de scratchpad (`gerador/gerar.py:8`).
- **Qualquer teste, guarda ou verificação automática sobre os esboços.** Nem a
  barra de verificação (`npm run typecheck`, `lint`, `test`, `mutate`,
  `e2e:fast`, `db:verify`, `.proofgate/verify.sh`) nem `src/language.test.ts`
  leem `docs/esbocos/`.
