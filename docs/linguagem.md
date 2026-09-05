# A língua visual do NORVA

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

## A ordem que vem antes de todas

**Destrói-se o layout antigo para pôr o novo por cima.** Nunca se acrescenta um
caminho novo ao lado do velho.

Isto é decisão do dono, dita depois de o erro acontecer: a cena do céu ganhou um
*ramo* para o Papel em vez de ser substituída, e o resultado foi um gradiente do
Orgânico aparecendo dentro do Papel. Dois caminhos vivos para a mesma coisa
sempre acabam com os dois na tela.

Converter uma tela é **reescrever o corpo dela**, não embrulhar o que existia.

---

## A anatomia de uma tela

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

## As duas famílias de desenho

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

## A cor

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

**E agora isto tem guarda: `src/theme/assinatura.test.ts`.** Ele lê cada `<Card>`
do aplicativo, olha o desenho que está no `icon`, e cobra o tom que a tabela
acima manda. A tabela do desenho mora em `src/components/glifos.ts` — quem
acrescenta um glifo declara ali de que assunto ele fala, antes de desenhar um
traço.

Ele nasceu de uma varredura que achou trinta e sete divergências e **de um erro
meu que ele mesmo teria evitado**: eu decidi que dinheiro era areia sem abrir
este arquivo, mudei cinco telas para combinar, e só o crítico adversarial pegou.
Dinheiro é `sky` porque está escrito aqui, e o aplicativo já cumpria.

Duas espécies que a varredura revelou e que a tabela sozinha não expressava:

- **medida** (`anfitriao`): um desenho que serve honestamente a mais de um
  assunto — o termômetro é câmara fria nos Ajustes e clima na tela do tempo, o
  calendário é a data de um pedido e o dia da semeadura. Toma o tom da tela, e
  continua cobrado contra ela.
- **porta**: um cartão que não fala de si, fala de para onde leva — a gaveta do
  "Mais", a seção da capa nos Ajustes. Carrega a cor do destino, declarado no
  guarda com o motivo ao lado.

## O desenho respira

**Cada desenho se mexe como ELE MESMO. Não existe mais um respiro só.**

Isto mudou por uma correção do dono, 5 de setembro. A regra anterior era a
generalização das duas exceções da cena da fábrica: todo crachá entrava pelo
`Alive`, que somava à chegada uma **respiração** de três centésimos de escala —
o mesmo movimento, para os vinte e seis desenhos. Ele voltou ao assunto
apontando a mesma cena e disse o que faltava: *"sutil, mas vivo"*, e *"todos
esses iconezinhos eu exijo animação como no exemplo que enviei"*.

O exemplo é a resposta. Na cena aprovada o sol **gira** porque é sol, a fumaça
**sobe** porque é fumaça, o picolé **enche** porque é o dia entrando. Nenhum
deles respira. Um respiro único aplicado a tudo é o oposto de "cada um como ele
mesmo" — é um movimento com vinte e seis nomes.

Então a vida foi para dentro do desenho, e o vocabulário é fechado
(`src/components/Vivo.tsx`), tirado da própria cena:

| movimento | o que faz | quem faz isso na cena |
|---|---|---|
| `gira` | volta inteira em torno de um ponto | o sol (30 s), o floco (48 s) |
| `sobe` | sobe e some, e recomeça embaixo | a fumaça da chaminé (6 s) |
| `balanca` | inclina para um lado e volta | — |
| `anda` | desliza no eixo e volta ao lugar | a caixa da expedição |
| `Coluna` | um nível que sobe dentro de uma forma fechada | o picolé que enche |

Três regras que vêm com ele:

1. **Só se mexe o que se mexeria no mundo, e só a PARTE que se mexe.** O
   termômetro não gira: sobe a coluna. O caminhão não pulsa: anda. A etiqueta
   balança em torno do furo, que é por onde ela está pendurada.
2. **E nem tudo se mexe.** Na cena aprovada, sete dos doze elementos estão
   parados — o galpão, a câmara, o morango, dois dos três picolés. Alvenaria não
   respira. Inventar movimento para um objeto em repouso é o mesmo defeito do
   alerta inventado, com outro nome.
3. **Ciclo longo.** Os laços perpétuos da cena são de trinta e de quarenta e
   oito segundos. Abaixo disso o movimento deixa de ser ambiente e passa a
   cobrar atenção que a tela não pediu.

O `Alive` continua, reduzido ao que ele sempre fez de certo: **a chegada**, na
mola `settle`, com o escalonamento de quarenta milissegundos do `Reveal`. **A
barra de abas fica de fora** — ali o ícone é orientação, não assunto.

`Reduzir movimento` para tudo, e **no repouso**: quem desliga vê o desenho
inteiro e no lugar. A primeira versão parava a etiqueta torta e a fumaça
invisível, porque estacionava o ciclo em zero em vez de estacionar no repouso —
por isso cada movimento declara onde ele descansa.

## As cenas

Cena é ilustração larga no topo de um cartão (`Landscape`, `FactoryScene`,
`SkyScene`). **Elas se ganham, não se distribuem.** Uma tela tem cena quando o
desenho *responde alguma coisa* — a paisagem da capa é a previsão de verdade, a
linha de produção mostra o tacho rodando e a caixa enchendo.

Cena que só enfeita é o mesmo defeito do alerta inventado: ensina a ignorar.

## Números

Toda figura grande responde com o que se compara ao lado — Lei 3, e
`src/law.test.ts` conta uma declaração por número. Contagem regressiva compara
com o próprio limite; estado ao vivo responde "o que está diferente agora"; e
quando não há o que comparar, o motivo fica escrito.

## Estado vazio

Não é uma frase cinza no meio da tela. É **desenho + uma frase + a próxima
ação** — "está tudo bem" é estado válido e bonito, e uma tela vazia é a primeira
coisa que todo mundo vê no primeiro dia.

## O que não fazer

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
