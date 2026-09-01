# NORVA — como se trabalha aqui

Sistema de gestão para quem **fabrica e distribui**. Nasce numa fábrica de
picolés, mas será publicado nas lojas: **nada de regra chumbada de sorvete, nada
de nome de empresa**.

O usuário final é o dono da fábrica, de baixa habilidade técnica. Quando
simplicidade e sofisticação brigarem, **simplicidade ganha**.

---

## Fundações que não se quebram

Estas não são preferências. Cada uma existe porque a alternativa corrompe um
número que alguém vai usar para decidir onde colocar dinheiro.

**Livro-razão append-only.** Não existe coluna `estoque_atual`. Saldo é a soma
dos movimentos, e a imutabilidade é imposta por *trigger no banco*, não por
convenção. Corrige-se por estorno, nunca por exclusão.

**`Cents` é inteiro, `Rate` é fracionário.** Valor que alguém paga e preço por
unidade não são o mesmo tipo de número. Polpa a R$ 12,40/kg é 1,24 centavo por
grama; arredondar isso para inteiro perde um quinto antes da primeira
multiplicação — foi um bug real. Só o valor final arredonda, uma vez. Dinheiro
nunca é float, em lugar nenhum.

**Permissão mora na consulta, nunca numa instrução.** Quem não pode ver custo
não recebe o número: a checagem roda *antes* da consulta, então não existe
número para vazar. Esconder botão é decoração.

**i18n desde o primeiro texto.** Nenhuma tela guarda uma palavra. Tudo vem de
`src/i18n/locales/`, nos três idiomas. `Widen<T>` faz chave nova em português
quebrar a compilação das outras duas até serem escritas.

**A camada de dados devolve fato, não frase.** Quem escreve português é a tela.
Um módulo que sabe o que depende do quê não deve saber falar.

**Multi-empresa desde a primeira linha.** `company_id` em toda tabela, RLS no
servidor.

**"Depende" vira dado, nunca código — e nunca uma pergunta.** Cada fábrica é um
caso: uma usa celular compartilhado na câmara fria, outra dá um aparelho por
pessoa; uma quer aprovação de pedido, outra não. Quando a resposta certa é
"depende de quem usa", **não se escolhe um dos lados e não se pergunta qual** —
constrói-se a escolha como configuração da empresa, e os dois caminhos existem.

Isto vale inclusive para as perguntas feitas ao dono: pedir que ele escolha
entre A e B quando A e B são preferências de cliente é empurrar para ele uma
decisão que o produto deveria absorver. A pergunta certa nesse caso é qual é o
**padrão** — não qual é o único.

---

## A Lei da Inteligência

Toda tela responde três coisas: **o que é normal ali, o que está diferente
agora, e qual é a próxima ação provável.** Tela que não responde as três não
está pronta.

1. Nunca peça o que o sistema pode deduzir.
2. Nenhum campo nasce vazio.
3. Nenhum número aparece sozinho — sempre com a comparação.
4. Avise na **data da decisão**, não na data do problema.
5. Erro se **impede**, não se reclama.
6. Toda conclusão abre a conta (`[por quê?]`).
7. "Está tudo bem" é estado válido e bonito. Alerta inventado ensina a ignorar
   alerta.

O sistema **sugere, nunca decide calado**. E a inteligência é matemática
determinística sobre o livro-razão — por isso funciona offline, e por isso o
`[por quê?]` é possível.

---

## Tom de voz

Frase curta, verbo na frente, segunda pessoa. **Orienta, não fiscaliza**
("Produza até segunda", não "Estoque insuficiente"). **Nunca culpa pessoa**
("Faltaram 3 caixas na conferência", não "a loja errou"). Zero jargão: a
confirmação diz o que vai acontecer, com os números por extenso.

Sistema que acusa vira inimigo da equipe, e equipe que vê o app como inimigo
sabota o dado.

---

## A barra de verificação

Antes de dizer que algo está pronto, **rode**. Não é opcional e não é por
amostragem:

```bash
npm run typecheck
npm run lint
npm test
npm run mutate       # quebra o código de propósito: a suíte morde mesmo?
npm run e2e          # o app dirigido num navegador de verdade
npm run db:verify    # Postgres descartável, seis garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

O `mutate` existe porque suíte verde não quer dizer regra protegida: quer dizer
que os exemplos escolhidos não a exercitam. Na primeira execução ele trocou o
`Math.round` do `amountOf` por `Math.floor` — *o* ponto de arredondamento do
sistema — e **noventa e dois testes continuaram verdes**. A regra da capa deste
projeto estava sustentada por coincidência aritmética.

O `e2e` existe porque três bugs passaram por toda a bateria unitária e só
apareceram quando o app foi aberto: uma confirmação que não existe na web,
rotas que abriam num banco vazio, e uma tela falando dois idiomas. **Nada disso
é visível de dentro de um módulo.**

Duas regras de operação, ambas cicatriz:

- **Nunca mate processo por padrão.** Um `pkill` largo nesta sessão matou a
  verificação que tinha acabado de ser disparada — inclusive a nova, junto com a
  velha. Se precisar parar algo, pare pelo PID que você mesmo anotou.
- **A proofgate lê `base..HEAD`, não a árvore de trabalho.** Marcador de
  justificativa em arquivo sem commit não existe para ela. Commit primeiro,
  depois confira.

O `proofgate` é o portão de entrega. **Qualquer ❌ significa que não está
pronto**, e todo ⚠️ pede justificativa escrita — nunca dispensa em silêncio.
Depois dele vem o portão de julgamento: diga em que nível a afirmação central
se sustenta (E0 acreditado → E3 exercitado de verdade → E4 visto em produção),
com o comando que provou. "Compilou" não é "funciona".

---

## `/insights`

O comando `/insights` gera um relatório sobre as sessões deste projeto. **Ele é
reservado ao usuário** — está marcado como `disable-model-invocation`, então
Claude não consegue rodá-lo nem deve reproduzir o que ele faz por outro caminho.

A diretriz, então, é de mão dupla e vale para os dois lados:

- **O usuário roda `/insights` com frequência** — é a única leitura de fora
  sobre como o trabalho está indo: onde o tempo foi, o que se repetiu, o que
  deu errado mais de uma vez.
- **Claude age sobre o que ele mostra.** Achado de `/insights` não é conversa:
  vira mudança no código, no `CLAUDE.md` ou na barra de verificação, do mesmo
  jeito que um ⚠️ da proofgate exige justificativa escrita. Padrão que aparece
  duas vezes num relatório é dívida, não coincidência.

---

## Insight constante — diretriz obrigatória

**Toda rodada de trabalho termina com uma pergunta: o que apareceu aqui que
ninguém tinha visto?** Não é enfeite de conversa e não é opinião — insight neste
projeto é achado que muda alguma coisa, e a prova de que mudou é o arquivo que
foi editado por causa dele.

Três regras, para não virar decoração:

1. **Todo insight vira uma linha em `docs/insights.md`**, com o que se viu, por
   que importa e o que mudou por causa disso. Achado sem consequência não entra
   — se não mudou nada, ou não era achado, ou o trabalho não acabou.
2. **Insight se procura, não se espera.** Antes de escrever código novo, a
   pergunta é o que o código existente está contradizendo: uma fundação que só
   vale no papel, uma função construída e nunca chamada, um número que só sobe,
   um teste que passa pelo motivo errado. Foi assim que se descobriu que o
   aplicativo tinha o livro-razão no domínio e um `estoque_atual` no banco.
3. **"Não achei nada" é resposta válida e precisa ser dita.** Inventar um achado
   para parecer diligente é o mesmo defeito do alerta inventado: treina a
   ignorar. Vale a mesma regra do briefing — está tudo bem é um estado.

Onde procurar, quando não houver pista óbvia: o que a fundação promete contra o
que o esquema faz · o que o domínio exporta contra o que as telas chamam · o que
o aparelho grava contra o que o servidor aceitaria · o que um teste afirma
contra o que ele exercita de verdade · o que a Lei da Inteligência exige de cada
tela contra o que ela responde hoje.

---

## Decisões do dono, já tomadas

Registradas aqui porque decisão esquecida vira pergunta repetida.

- **Entrada no chão de fábrica: configuração da empresa, não escolha nossa.**
  Compartilhado usa PIN numa grade de nomes — dois segundos, de luva, offline.
  Pessoal entra uma vez e fica. Os dois existem; a empresa escolhe.
- **Quem cria a empresa é o dono**, cadastrando-se sozinho. A partir daí ele
  cadastra as outras pessoas diretamente **ou** aprova quem pediu associação por
  um código da empresa. Os dois caminhos.

Ainda em aberto, e é dele: se o movimento operacional grava **quem** fez ou
**onde** aconteceu. O tom de voz manda nunca culpar pessoa, e a cadeia de
custódia existe para localizar a perda sem acusar ninguém — o que argumenta por
aparelho e posto. E se o operador pode conferir a prateleira, já que contagem
está no piso de autonomia.

---

## Faseamento

**Nenhuma fase começa antes da anterior estar em uso real.** Hoje a Fase 1
(insumo → receita → custo → nota) está entregue e ainda não foi usada na
fábrica, então **Fase 2 está travada** — produção, lote, QR e câmara fria não
começam. Isso não é cautela, é a regra: construir a tela de produção sem ver um
operador registrar é adivinhar.

---

## Git

Desenvolvimento na branch designada da sessão; `main` só por merge de PR, que é
ato do dono. Migração é append-only: `supabase/migrations/` e o `MIGRATIONS` de
`src/data/db.ts` só crescem — **editar um passo que já rodou faz o banco e o
arquivo divergirem em silêncio**.

Commit explica *por que*, não *o que* — o diff já diz o quê.
