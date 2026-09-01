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
npm run e2e          # o app dirigido num navegador de verdade
npm run db:verify    # Postgres descartável, quatro garantias
bash .proofgate/verify.sh
```

O `e2e` existe porque três bugs passaram por toda a bateria unitária e só
apareceram quando o app foi aberto: uma confirmação que não existe na web,
rotas que abriam num banco vazio, e uma tela falando dois idiomas. **Nada disso
é visível de dentro de um módulo.**

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
