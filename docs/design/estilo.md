# O estilo do Papel: **diagramação editorial**

**Em inglês: _editorial layout_** (também _editorial design_; quando se quer marcar
a oposição, _print-inspired UI_).

Gravado aqui a pedido do dono, em 6 de setembro, porque nome de estilo esquecido
vira discussão repetida — e porque a partir daqui "faz no padrão do Papel" passa a
ter uma resposta que não depende de quem lembra.

---

## O que é

É a linguagem da **página impressa**: não existe caixa. A hierarquia não vem de
container nenhum — vem de **fio**, **olho**, **manchete**, **espaço em branco** e
**alinhamento**. Um assunto termina onde o próximo começa, e o que separa os dois é
um traço de um pixel, não uma borda com canto arredondado em volta de cada um.

O oposto dela é o **card-based UI**, que é a linguagem da outra pele deste
aplicativo, o **Orgânico**: cada assunto numa superfície própria, com crachá
redondo, canto generoso e cor em massa. Não é que uma seja melhor — são dois
negócios diferentes olhando a mesma tela. A fábrica que mostra o app para o
contador quer a página impressa; a que abre o celular na doca às seis da manhã
quer a paisagem.

No código a escolha tem nome e mora num traço só: `Tracos.genero` em
`src/theme/tokens.ts` — `'pagina'` para o Papel, `'superficie'` para o Orgânico.
**Nove componentes perguntam a ele**, e é isso que faz duas peles parecerem dois
produtos em vez de duas paletas.

---

## O vocabulário, com o par em inglês

| português | inglês | o que é |
|---|---|---|
| **fio** | *rule* / *hairline rule* | o traço fino que separa dois assuntos. É ele que substitui a borda do cartão. |
| **fio grosso** | *heavy rule* | o traço de 2 px que fecha a manchete e abre o corpo da página. |
| **olho** | *kicker* / *eyebrow* | a linha curta em versalete acima do título — "NORVA · segunda, 7 de setembro". |
| **manchete** | *headline* | o título grande em serifa. |
| **apoio** | *deck* / *standfirst* | a frase abaixo da manchete que explica sem repetir. |
| **versalete** | *small caps* | a caixa alta pequena com entreletra aberta, que marca seção sem precisar de negrito. |
| **faixa sangrada** | *full-bleed band* | fundo que vai de margem a margem, sem borda e sem canto. É o equivalente editorial da cor em massa. |
| **boxe** | *sidebar* / *pull-out box* | matéria que veio de fora, marcada por fio vertical na lateral. É o que o bloco do tempo usa. |
| **selo** | *chip* / *tag* | cor em massa do tamanho de uma palavra, colada no dado. É por onde o pastel entra forte sem a página virar painel. |
| **régua da semana** | *bar rule* | as sete colunas com o dia de hoje em tinta cheia. |

---

## As regras que decorrem disso

Não são gosto: cada uma já foi decidida e uma delas foi decidida corrigindo um erro
meu.

1. **Nada de caixa no Papel.** Nem borda, nem canto, nem fundo próprio por assunto.
   O bloco do tempo era a exceção e o dono recusou: *"quero ele mais entrosado com
   o tema"*. Ele agora pergunta ao `genero` como os outros.
2. **O fundo é UM só.** Decisão do dono no esboço de 6 de setembro, vendo três
   faixas de tinta diferentes: *"tem umas inconsistências nas cores de fundo... tem
   q ser uma cor só, a original do tema"*. Retalho de tintas é o defeito que a
   faixa sangrada vira quando são várias.
3. **O pastel entra nos ELEMENTOS.** Selo, barra, preenchimento, olho. Cor em massa
   do tamanho de uma palavra, nunca do tamanho de uma seção — que é como se abusa
   do pastel, que é o que o dono pediu, sem quebrar a regra 2.
4. **Cor de ícone entra em traço, nunca em massa.** Decisão do dono: a ilustração
   é monoline, e um ícone que vira selo cheio briga com ela.
5. **Matéria de fora se marca com fio vertical**, não com moldura — que é como
   jornal marca citação e matéria de agência.

---

## Onde isto está desenhado

- `docs/design/aprovados/papel.html` — a capa aprovada, que é a lei da ilustração.
- `docs/design/esbocos/papel-pagina-inteira.html` — a página inteira em diagramação
  editorial, com quatro peças que eram cartão viradas em seção.
- `src/home/capas/papel.tsx` — a roupa da pele.
- `src/theme/tokens.ts` — `Tracos`, e as duas paletas.

---

## Como se julga um desenho aqui

**Uma foto por vez não responde a pergunta que importa.** Ela responde *"essa cena
está boa?"*; a que decide é *"elas parecem a mesma mão?"* — e essa só a folha
inteira responde.

    npm run shot -- --com-dado --rota /places,/catalog,/orders
    python3 scripts/folha-de-cenas.py

Na primeira vez que rodou, com sete cenas lado a lado, ela achou três defeitos que
sete fotos separadas não tinham achado: sete cópias do mesmo picolé no catálogo,
dois balões idênticos no assistente, e um pedaço de chão solto no espelho.

E o defeito que ela pega melhor que qualquer outro instrumento é o que o dono
nomeou em três letras — **feio** — e que tem sempre a mesma forma: repetição
regular. O conserto também é sempre o mesmo: tamanhos diferentes, vãos desiguais,
e uma só peça com cor.
