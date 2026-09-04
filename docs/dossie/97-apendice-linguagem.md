## Apêndice H — Linguagem visual e briefing dos esboços, verbatim

### `docs/linguagem.md`

#### A língua visual do NORVA

**Por que este arquivo existe.** A capa foi redesenhada primeiro e sozinha. O
dono navegou para a segunda tela e disse o que viu: *"os temas antigo e os novos
estão se sobrepondo"*. Não era bug de tema — era **uma tela nova e vinte
antigas**, e a costura entre elas é o que parece dois aplicativos.

Este arquivo é o que impede que a correção disso produza vinte dialetos. O que
está aqui é **descrição do que a capa já faz**, não invenção: cada regra abaixo
aponta para o código que a executa hoje.

A guarda que mede isto é `src/language.test.ts`, e ela tem a lista das telas que
ainda faltam. A lista só encolhe.

---

##### A ordem que vem antes de todas

**Destrói-se o layout antigo para pôr o novo por cima.** Nunca se acrescenta um
caminho novo ao lado do velho.

Isto é decisão do dono, dita depois de o erro acontecer: a cena do céu ganhou um
*ramo* para o Papel em vez de ser substituída, e o resultado foi um gradiente do
Orgânico aparecendo dentro do Papel. Dois caminhos vivos para a mesma coisa
sempre acabam com os dois na tela.

Converter uma tela é **reescrever o corpo dela**, não embrulhar o que existia.

---

##### A anatomia de uma tela

Na ordem em que o olho encontra:

1. **`CollapsingHeader`** com `title` e `overline`. O título é o assunto em duas
   ou três palavras; a sobrelinha é o que a tela responde, em caixa alta e uma
   linha só — ela é truncada, então nada que importe mora nela.
2. **`AreaProvider area="…"`** envolvendo a tela inteira. É de onde sai o
   `accent`, e é o que faz a aba, o cabeçalho e os cartões concordarem.
3. **Cascata de `Reveal index={n}`**, um por bloco, começando em 0 e sem pular
   número. É a entrada: sobe catorze pixels e aparece, quarenta milissegundos
   entre um e o próximo. Movimento nunca atrasa informação — a leitura de tela
   recebe tudo montado no primeiro quadro.
4. **`Card` com `hue` + `icon` + `title`** para cada assunto. Fundo lavado de 8 a
   13% do tom, borda inteira na mesma cor, trilho à esquerda mais forte. Um
   `title` sem `icon` não compila: o cabeçalho do cartão só existe com o crachá.
5. **A ação provável, embaixo.** Um `Button` primário só; o resto é fantasma.
   Corrigir, apagar e estornar são sempre fantasma — botão grande e colorido
   convida, e ninguém deve ser convidado a desfazer.

##### As duas famílias de desenho

- **`Glyph*`** (`src/components/Glyph.tsx`) — duas camadas: massa preenchida em
  opacidade baixa e traço por cima. É o crachá do cartão e o assunto de uma
  linha grande. `size={26}`.
- **`Icon*`** (`src/components/icons.tsx`) — traço fino de 1,6 numa grade de 24.
  É a barra de abas, o chevron, o ícone de linha de lista. `size={18}` a `26`.

Trocar as duas é o erro que o dono já apontou: glifo gordo na barra de abas vira
fileira de manchas; ícone fino como crachá some dentro do círculo pastel.

**A espessura é da identidade, não do ícone:**

```tsx
const { skin } = useTheme();
const traco = skin === 'papel' ? 1.7 : 2.2;
// …
icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
```

Abaixo de 2 a massa some sozinha (`massIf`): o Papel é só linha, e é assim que
ele foi escolhido.

##### A cor

Toda cor sai de `useTheme()`. Nenhuma tela escreve hexadecimal — a única exceção
registrada é a etiqueta do lote, que é papel branco com tinta preta em qualquer
tema porque é o que sai da impressora.

O `hue` de um cartão é o tom do **assunto**, e o assunto tem tom fixo em todo o
aplicativo, que é o mesmo da aba correspondente:

| assunto | tom |
|---|---|
| produção, tacho, lote | `palette.apricot` |
| transporte, caixa, remessa | `palette.lilac` |
| insumo, estoque, almoxarifado | `palette.mint` |
| pedido, cliente, acordo | `palette.sage` |
| dinheiro, custo, preço | `palette.sky` |
| perda, vencimento | `color.danger` / `color.warning` |

Quem vê laranja sabe que é produção antes de ler.

##### O desenho respira

Todo crachá de cartão entra pelo `Alive` (`src/components/Alive.tsx`), e o
`Card` faz isso sozinho — quem usa `icon` não precisa saber. Glifo solto dentro
de uma tela recebe o `Alive` na mão.

São dois movimentos, na mesma medida da cena da fábrica:

- **a chegada**, que assenta na mola `settle` com o mesmo escalonamento de
  quarenta milissegundos do `Reveal` — o crachá termina de se montar junto com
  o cartão que o carrega;
- **a respiração**, três centésimos e meio de escala para cada lado em
  `motion.breatheMs`. Em vinte e seis pixels isso é menos de um pixel de
  viagem.

É a generalização das duas exceções admitidas na cena da fábrica (o sol e o
floco giram porque um sol parado lê como imagem quebrada): um símbolo inerte no
meio de uma página que se monta lê como carimbo colado. **A barra de abas fica
de fora** — uma barra que respira é ruído, e ali o ícone é orientação, não
assunto.

`Reduzir movimento` apaga os dois e o desenho continua inteiro.

##### As cenas

Cena é ilustração larga no topo de um cartão (`Landscape`, `FactoryScene`,
`SkyScene`). **Elas se ganham, não se distribuem.** Uma tela tem cena quando o
desenho *responde alguma coisa* — a paisagem da capa é a previsão de verdade, a
linha de produção mostra o tacho rodando e a caixa enchendo.

Cena que só enfeita é o mesmo defeito do alerta inventado: ensina a ignorar.

##### Números

Toda figura grande responde com o que se compara ao lado — Lei 3, e
`src/law.test.ts` conta uma declaração por número. Contagem regressiva compara
com o próprio limite; estado ao vivo responde "o que está diferente agora"; e
quando não há o que comparar, o motivo fica escrito.

##### Estado vazio

Não é uma frase cinza no meio da tela. É **desenho + uma frase + a próxima
ação** — "está tudo bem" é estado válido e bonito, e uma tela vazia é a primeira
coisa que todo mundo vê no primeiro dia.

##### O que não fazer

- Ícone em toda linha de lista: vira papel de parede e some.
- Animação que não é entrada nem resposta a toque.
- Cartão colorido chapado: o acordo é **fundo lavado**, porque tela colorida
  cansa quem olha oito horas.
- Chave de dicionário nova quando já existe uma que diz o mesmo. Quatro seções
  inteiras deste dicionário existiram nos três idiomas sem uma tela lendo.
- **E o inverso: chave de outra tela quando ela nomeia outra grandeza.** A aba de
  transporte encabeçava a contagem de DESTINOS com `home.boxesTitle` — "Saiu para
  as lojas" —, que na capa rotula uma contagem de CAIXAS, enquanto o comentário da
  própria aba dizia "conta destinos, não caixas". Frase compartilhada de verdade
  (o convite de abrir, a palavra de plural) se empresta; rótulo que nomeia um
  número, não.
- **Rótulo fixo em cima de cartão que muda de assunto.** "ENTRA NA RECEITA COMO"
  sobre material de loja, que não entra em receita nenhuma; "Novo insumo" no
  cabeçalho com "Embalagem" aceso a um dedo de distância; "Registrar a
  transferência" no botão que grava uma devolução. Se o cartão muda de assunto no
  toque, o rótulo muda com ele.
- **Selo de dois estados sobre um fato de três.** `delta >= 0` fazia o empate
  imprimir "0% acima de ontem" com 480 e 480 na mesma tela. Empate é estado, e
  "está tudo bem" é estado válido e bonito (Lei 7).
- **Promessa dita fora do estado em que ela é verdade.** "Conte e escreva aqui — o
  número que o sistema espera fica escondido" ficava na tela **fechada**, com o
  número uma linha acima e nenhum campo para escrever: a tela lia a lei e mostrava
  a infração no mesmo cartão.
- Frase escrita na tela. Tudo vem de `src/i18n/locales/`, nos três idiomas.

### `docs/esbocos/_briefing.md`

#### Briefing dos esboços — leia antes de escrever

Você desenha UMA tela: a capa (briefing) do NORVA, sistema de uma fábrica de
picolés. Arquivo HTML único, sem JS, sem rede, sem fonte externa (a máquina que
fotografa não tem internet — Google Fonts NÃO carrega). Só CSS e SVG inline.

##### Tamanho e forma
- `body { width: 412px; min-height: 915px; }` — é um celular.
- A barra de abas fica fixa embaixo, 78px de altura, e **tem os ícones de
  verdade** (o snippet está em `_tabbar.html`, cole e ajuste só as cores).
- Deixe ~110px de respiro no fim do conteúdo para a barra não cobrir nada.

##### O dado é sempre este, e não se inventa outro
- Produção de hoje: **500 unidades**. Ontem: **478**. Contra a quarta passada: **+19**.
- Semana (7 colunas, da mais velha para hoje, altura relativa): 38% 44% 41% 6% 82% 46% **64% (hoje)**.
  Rótulos: Q S S D S T Q (ou qui sex sáb dom seg ter qua).
- Insumo acabando: **Polpa de morango, acaba em 1 dia**.
- Expedição: **1 caixa saiu hoje**.
- Preços que mexeram: Polpa de morango ▼0,6% · Açúcar cristal ▼2,2% · Glucose 38DE ▲0,9%.
- Clima **São Paulo: 21°**, mínima 13°, **47% de chance de chuva**, amanhã **+4°**.
- Data: quarta-feira, 2 de setembro.
- Marca: **NORVA**.

##### Regras que não se quebram
- **Nada de botão "Lançar produção" na capa** — o dono mandou tirar; a aba
  Produção já é essa porta.
- O clima aparece em TODAS as telas, com destaque próprio.
- Todo número tem sua comparação do lado (500 nunca aparece sozinho).
- Nada de foto: o que parecer imagem é desenhado em SVG/CSS.
- Português do Brasil, tom curto e direto.

##### O que o dono pediu explicitamente
- **Mais ícones e imagens na tela** — foi a crítica principal.
- **Menos monocromático** onde a família for escura/neutra.
- Que cada variante seja **claramente diferente das outras duas** da mesma
  família: não mude só a cor, mude a ESTRUTURA (o que é grande, o que divide
  linha, o que vira lista, o que vira bloco).

### `docs/esbocos/README.md`

#### Dez esboços da capa — 2 de setembro

O dono recusou a capa três vezes ("está feio ainda", "não acerta a mão") e então
pediu o que faltava: **dez identidades diferentes, para ver por onde caminhar.**

Estes arquivos são HTML puro, não o aplicativo. A escolha é de linguagem visual —
raio de canto, densidade, escala tipográfica, onde a cor entra, o que é imagem —
e essa pergunta se responde em vinte minutos aqui contra três horas em React
Native. O que for escolhido vira código de verdade; **os outros nove são
apagados**, junto com esta pasta.

Todos mostram exatamente o mesmo dado, e não é um dado inventado: é o que a
fábrica de exemplo produz depois de "plantar duas semanas" — 500 unidades hoje,
478 ontem, +19 contra a quarta passada, polpa acabando em um dia, uma caixa
expedida, três preços que mexeram, e São Paulo a 21° com 47% de chance de chuva.

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

**Por que não tem foto em nenhum.** Este aplicativo abre offline, dentro de uma
câmara fria, num celular que a fábrica comprou barato. Foto é peso que não
carrega e não aparece. Tudo o que parece imagem aqui é desenhado em código —
onda, sol, nuvem, degradê — e por isso atravessa para o React Native sem
biblioteca nova.

**O que os esboços não conseguem mostrar.** Movimento e ligação entre telas: o
cartão que entra escalonado, o número que afunda quando o dedo encosta, e a
transição em que tocar o número do dia *vira* a tela de produção com o mesmo
número no lugar. Isso é código, e é a primeira coisa depois da escolha.


##### Segunda rodada — 15 variantes, 2 de setembro à noite

O dono eliminou metade e ficou com **2 (Papel), 5 (Vidro), 6 (Suíço), 8
(Orgânico) e 9 (Terminal)**, com três observações que valem para todas as
variantes: *"seria bom se tivesse mais ícones/imagens na tela"*, *"sem ser tão
monocromático"* (sobre o 6 e o 9) e *"o 8, se trabalhar mais, fica bom"*.

E uma pergunta que era um defeito meu: **"por que você removeu os ícones?"** Não
removi do aplicativo — a barra de abas está intacta. O que estava sem ícone era o
**esboço**: naquela primeira rodada a barra era só texto. Os quinze desta rodada
carregam os ícones de verdade, extraídos de `src/components/icons.tsx` e
guardados em `_tabbar.html`, que é o pedaço compartilhado pelos quinze.

Três por família, e a regra era mudar a **estrutura**, não só a cor:

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

`_briefing.md` é o que os cinco desenhistas receberam: o dado exato, o tamanho, e
as regras que não se quebram — inclusive a que saiu desta rodada, **nada de
botão "Lançar produção" na capa**, porque a aba Produção já é essa porta.


##### Terceira rodada — as três finalistas, quatro variações cada

O dono olhou os quinze e disse: *"quase soltei um palavrão de tão impressionado.
Dessa vez você acertou na mão — acertou tanto que a gente vai ter que refinar
mais, porque fiquei indeciso por ter gostado de vários."* Depois escolheu três:
**11 (Papel ilustrado)**, **20 (Orgânico dia)** e **22 (Orgânico noite)**, com
uma regra: quatro variações de cada, **duas claras e duas escuras**.

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

**O que a rodada ensinou, e não estava na pergunta.** As três famílias não são
três aplicativos, são **dois**: o Papel é um, e o Orgânico dia e noite são a
mesma identidade em dois momentos do mesmo dia. O 39 e o 40 provam isso — a
identidade noturna vira dia trocando só o céu. Ou seja, dia e noite não são uma
escolha: são os dois temas que o app já tem, com a paisagem acompanhando.

**Uma escolha que eu recomendaria contra, apesar de ser a mais bonita.** A
semana em linha ondulada (34, 38, 40) sugere continuidade entre os dias que não
existe: domingo não desce suavemente até segunda, ele é outro dia. Barra tem base
zero, curva não tem.

###### `gerador/`

Os doze saíram de um gerador em Python, e não de doze arquivos escritos à mão. A
razão é a mesma que faz o `_briefing.md` existir: doze telas comparáveis precisam
do mesmo dado, da mesma barra de abas e do mesmo espaçamento — o que muda entre
elas tem que ser a **decisão de desenho**, não um descuido de quem copiou. O
gerador também é o que permite trocar a paleta de uma família inteira numa linha
quando o dono apontar a escolhida.
### Os 38 esboços, por título

Os arquivos HTML em si não estão transcritos (são páginas de layout, não especificação),
mas os títulos registram o caminho da investigação — e a seção 32 explica o que cada
candidato propunha.

| Arquivo | Título |
|---|---|
| `01-aurora.html` | (sem título) |
| `02-papel.html` | (sem título) |
| `03-aneis.html` | (sem título) |
| `04-vitrine.html` | (sem título) |
| `05-vidro.html` | (sem título) |
| `06-suico.html` | (sem título) |
| `07-brinquedo.html` | (sem título) |
| `08-organico.html` | (sem título) |
| `09-terminal.html` | (sem título) |
| `10-galeria.html` | (sem título) |
| `11-papel-a.html` | NORVA — papel com ilustração |
| `12-papel-b.html` | NORVA — papel em duas colunas |
| `13-papel-c.html` | NORVA — papel com cor |
| `14-vidro-a.html` | NORVA — vidro com profundidade |
| `15-vidro-b.html` | NORVA — vidro em mosaico |
| `16-vidro-c.html` | NORVA — vidro claro |
| `17-suico-a.html` | NORVA — Suíço com pictograma |
| `18-suico-b.html` | NORVA — Suíço em quatro cores |
| `19-suico-c.html` | NORVA — Suíço diagramático |
| `20-organico-a.html` | NORVA — orgânico ilustrado |
| `21-organico-b.html` | NORVA — orgânico frutado |
| `22-organico-c.html` | NORVA — orgânico noturno |
| `23-terminal-a.html` | NORVA |
| `24-terminal-b.html` | NORVA |
| `25-terminal-c.html` | NORVA |
| `29-papel-claro-a.html` | NORVA — papel claro, cena grande |
| `30-papel-claro-b.html` | NORVA — papel claro, vinheta |
| `31-papel-escuro-a.html` | NORVA — papel escuro, cena grande |
| `32-papel-escuro-b.html` | NORVA — papel escuro, vinheta |
| `33-organico-claro-a.html` | NORVA — orgânico dia, cena grande |
| `34-organico-claro-b.html` | NORVA — orgânico dia, formas |
| `35-organico-escuro-a.html` | NORVA — orgânico entardecer |
| `36-organico-escuro-b.html` | NORVA — orgânico musgo |
| `37-noite-escuro-a.html` | NORVA — noite ilustrada |
| `38-noite-escuro-b.html` | NORVA — noite mínima |
| `39-noite-claro-a.html` | NORVA — amanhecer |
| `40-noite-claro-b.html` | NORVA — dia limpo |
| `_tabbar.html` | (sem título) |
