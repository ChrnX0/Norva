# Roadmap

**Por que este arquivo existe.** Em 3 de setembro, uma sessão terminou o escopo
escrito e ficou sem lista — não por falta de trabalho, mas porque a lista morava
espalhada: as fases do `CLAUDE.md`, as dívidas do `docs/insights.md` e a cabeça de
quem estava trabalhando. A regra de "nunca ocioso" diz que a próxima coisa vem da
**lista escrita**; sem uma, ela vira convite a inventar tarefa, que é pior que
parar.

Então: **este arquivo é a lista escrita.** Se algo não está aqui e não está numa
das decisões do `CLAUDE.md`, não é a próxima coisa.

---

## Como este arquivo se mantém vivo

Três regras, e as três existem porque a alternativa apodrece:

1. **Item fechado sai daqui no mesmo commit que o fecha.** Roadmap que lista o que
   já existe manda alguém construir duas vezes — e o custo não é o tempo, é a
   confiança: depois do segundo item errado, ninguém lê mais o arquivo.
2. **Item novo entra com evidência de arquivo.** `arquivo:linha` que sustenta o
   estado. Sem isso é palpite, e palpite em roadmap tem a mesma cara de fato.
3. **Item parado carrega o que o destrava**, não uma promessa de data. "Precisa de
   aparelho na mão" é informação; "semana que vem" é ficção.

## Como a ordem é decidida

Não por fase — o portão é **por item**, e é o do `CLAUDE.md`, nesta ordem:

- **P1 — quem chama isto no mesmo commit?** Sem chamador, não entra. É a doença
  provada deste repositório: coluna, função, chave de dicionário e tabela que
  existiram sem escritor.
- **P2 — complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item
  depende de observar alguém usando. **Mas antes de travar:** se o que muda com a
  observação é *preferência de quem usa*, não é espera nem pergunta — é
  configuração, e os dois caminhos existem.
- **P3 — entrando errado, conserta com um commit ou com migração e estorno?** O que
  toca `supabase/migrations/`, o caminho de escrita de `movements` ou a semântica de
  `movement_kind`/`location_kind` é caro e permanente. Forma de esquema se adivinha
  de graça enquanto há zero linhas; conteúdo de livro-razão não se corrige, se
  estorna.

Consequência prática da ordem: **o que é P3 e está barato agora sobe na lista**, e o
que é P2 puro espera uso real em vez de virar código adivinhado.

---

## A lista

**Ainda não está aqui — e a ausência é dita em vez de deixar o arquivo vazio**, porque
roadmap sem itens se lê como "nada a fazer", que é a mentira mais fácil deste
formato. Os itens estão sendo levantados lendo o repositório em sete eixos (escopo do
mês, dívidas do `insights.md`, servidor sem escritor, aparelho sem chamador, Lei da
Inteligência tela a tela, o que depende de aparelho ou servidor, e os cortes já
decididos), e cada afirmação de "falta X" passa por refutação antes de entrar: um
item errado manda a próxima sessão construir o que já existe.

Até eles chegarem, o que vale como lista é o que está logo abaixo — o que ficou
**fora por decisão** — mais as duas coisas paradas por falta física, nomeadas no
`CLAUDE.md`: os três postos de controle que dependem do app do entregador, e a
ergonomia da F3 (tela capacitiva a −18 °C, luva, QR a um braço), que não se verifica
sem aparelho na mão.

---

## Fora do escopo, por decisão escrita

Não se re-litiga o que já foi decidido. Cada corte tem razão, e a razão é o que
impede a decisão de voltar como "boa ideia" numa sessão futura:

| fora | razão escrita |
|---|---|
| **Relatório do Espelho da Loja** | a captura entra (contagem cega, perdas com motivo); o relatório **mente com duas semanas de dado** |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; e o plano já diz que nada depende dele |
| **Compras inteligentes** | precisam do **prazo observado** do fornecedor, que só existe depois de meses de nota |
| **Trunfos** (PAC/POD, clima, roteirização) | diferencial de mercado, não a dor de hoje |

E as decisões do dono que **restringem desenho futuro** — quem for construir por
cima delas, leia antes de "consertar":

- **Entrada no chão de fábrica é configuração da empresa**, não escolha nossa: PIN
  numa grade de nomes (compartilhado) e conta pessoal existem os dois.
- **Quem cria a empresa é o dono**, e daí ele cadastra pessoas **ou** aprova quem
  pediu associação por código. Os dois caminhos.
- **O relatório fala de onde, não de quem.** O livro-razão sempre grava quem
  (`recorded_by`); nomear na tela é opt-in (`names_who_recorded`).
- **`recorded_by` e `operator_id` são duas perguntas** — qual conta escreveu (imposto
  pelo servidor, incedível) e quem estava com o aparelho. Uma coluna só para as duas
  já custou uma rodada.
- **Aparelho emprestado entra como produção e nada mais** — papel `operator`, sem
  custo, sem preço, sem dinheiro.
- **O operador confere a prateleira.** O que protege o número é o piso (contagem
  perguntada toda vez, gravada como diferença), não a permissão.
