# Dez esboços da capa — 2 de setembro

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


## Segunda rodada — 15 variantes, 2 de setembro à noite

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


## Terceira rodada — as três finalistas, quatro variações cada

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

### `gerador/`

Os doze saíram de um gerador em Python, e não de doze arquivos escritos à mão. A
razão é a mesma que faz o `_briefing.md` existir: doze telas comparáveis precisam
do mesmo dado, da mesma barra de abas e do mesmo espaçamento — o que muda entre
elas tem que ser a **decisão de desenho**, não um descuido de quem copiou. O
gerador também é o que permite trocar a paleta de uma família inteira numa linha
quando o dono apontar a escolhida.
