# Login e conta — o estudo, antes do código

> *"Depois do layout, o login/conta é o próximo, e ele pede estudo antes de código: é a
> base de perfil, pedido de loja e notificação."* — decisão do dono, 5 de setembro.

Este arquivo não propõe telas. Ele responde três coisas: **o que já existe** (mais do que
parece), **o que falta** e **o que ainda é decisão de dono**. Código só depois.

---

## 1. O que já existe, e é mais do que parece

### No servidor, desde a primeira migração

| | |
|---|---|
| `auth.users` | a identidade que o Supabase autentica |
| `memberships` | `company_id` + `user_id` + `display_name` + `capabilities[]`, único por par |
| `movements.recorded_by` | `not null references auth.users(id)` — **quem escreveu**, imposto pelo servidor |
| `movements.operator_id` | `references memberships(id)` — **quem estava com o aparelho**, anotado na hora |
| RLS | toda política passa por `auth.uid()` e por `current_companies()` |

**As duas colunas são duas perguntas diferentes, e isso já custou uma rodada inteira**
(`0014_who_was_holding_it.sql`): `recorded_by` é a conta que escreveu, imposta pelo
servidor e incedível; `operator_id` é quem estava segurando o celular, escolhido no
momento. Uma coluna só respondendo as duas é erro conhecido.

### No aparelho

- `V-` de `src/data/db.ts` já carrega `operator_id` (`ALTER TABLE movements ADD COLUMN`).
- `src/domain/access.ts` tem **18 capacidades** e **7 papéis** como modelos.
- A fila de sincronização (`src/sync/`) serializa e sobe — e as políticas de UPDATE já
  foram endurecidas por causa dela.

### O que NÃO existe

**Nenhum cliente Supabase.** Nem em `package.json`, nem em `node_modules`. Toda menção ao
nome é comentário ou leitura da pasta de migrações. As 33 migrações são arquivos
versionados, provados pelo `db:verify` contra um Postgres descartável — nuvem nenhuma.

Isso é decisão do dono, não pendência: *"o servidor sobe o mais tarde possível"*. Enquanto
o caminho de escrita não existir de verdade, provisionar (e pagar) projeto é gastar por
nada.

---

## 2. As decisões já tomadas, que o estudo não reabre

1. **O login autentica o SISTEMA, não a pessoa.** A conta é da empresa. Ela distribui
   acesso criando outros e-mails ou mandando código de convite por perfil — não é o
   e-mail pessoal do operador que entra no app.
2. **Quem cria a empresa é o dono**, cadastrando-se sozinho. A partir daí ele cadastra as
   outras pessoas **ou** aprova quem pediu associação por um código da empresa. **Os dois
   caminhos existem.**
3. **A entrada no chão de fábrica é configuração da empresa, não escolha nossa.**
   Compartilhado usa PIN numa grade de nomes — dois segundos, de luva, offline. Pessoal
   entra uma vez e fica. **Os dois existem; a empresa escolhe.**
4. **Aparelho emprestado entra como produção e nada mais.** Quem está com ele usa
   `operator` — sem custo, sem preço, sem dinheiro.
5. **O aparelho tem responsável.** O movimento aponta para o aparelho, o aparelho aponta
   para uma pessoa. Quem quiser nomear a cada caixa liga `names_who_recorded`.
6. **Sem dados fiscais no começo.** CPF e CNPJ ficam para depois: pedi-los prenderia o
   produto ao Brasil, e o app vai para as duas lojas.
7. **Perfil é dado**, com os sete de hoje como modelos prontos, não como lista fechada.

---

## 3. O que falta, em três camadas

### Camada 1 — o aparelho sozinho (não precisa de servidor)

Hoje o aplicativo é de uma empresa só (`LOCAL_COMPANY_ID`) e de uma pessoa só. Falta:

- **A grade de nomes com PIN**, para o modo compartilhado. É tela e é `meta` local; não
  depende de nuvem. O `operator_id` que ela escolhe já tem coluna nos dois lados.
- **A escolha de quem está operando** no momento de registrar — hoje nenhum registro
  pergunta, e a coluna nasce nula.
- **O responsável do aparelho**, que é de onde sai a responsabilidade quando o relatório
  não nomeia ninguém.

~~Nada disso pede o servidor, e tudo isso é exercitável com a foto no emulador.~~
**ERRADO — corrigido em 6 de setembro, antes de escrever a primeira linha.**

Fui construir e fui medir antes. `movements.operator_id` é
`uuid references memberships(id)` (`supabase/migrations/0014_who_was_holding_it.sql:21`)
e `memberships.user_id` é `not null references auth.users(id)`
(`0001_foundation.sql:60`). O aparelho **não pode criar `auth.users`**, logo não pode
criar membership, logo **não pode inventar o id de um operador**.

E o id inventado não ficaria quieto: `operator_id` está na lista fechada de colunas que
a fila envia (`src/sync/serialize.ts:351`) e viaja tal e qual. No dia em que a sincronia
existir, o primeiro movimento com um id local seria recusado por chave estrangeira — e o
motor **para a fila no primeiro buraco de propósito**, então produção, contagem e leitura
de câmara gravadas depois ficariam presas atrás dele. É exatamente o defeito crítico que
esta branch já consertou uma vez (a fila travada atrás de um pedido reenviado).

Hoje isso está adormecido porque **nada escreve `operator_id`**. Escrever seria acordá-lo.

**A leitura certa da decisão do dono está no próprio texto dela:** *"a empresa distribui
acesso criando outros e-mails ou mandando código de convite por perfil"*. Quem opera
**tem** conta — criada pela empresa, não usada por ele para entrar no celular
compartilhado. Não há contradição entre a decisão e o esquema; a contradição era a minha
suposição de que a lista de gente podia nascer no aparelho.

**Então a camada 1 não é independente do servidor.** O que sobra dela sem servidor é a
grade de nomes escolhendo alguém que o razão não pode nomear — trabalho que parece
entrega e não é.

### Camada 2 — a conta da empresa (pede servidor)

- Cliente Supabase, sessão persistida, e o `recorded_by` deixando de ser um id local.
- Cadastro do dono, criação da empresa, e os dois caminhos de entrada das outras pessoas.
- Convite por código, com o perfil já escolhido por quem convida.

**Antes de qualquer linha disto: a sincronia precisa existir de verdade.** Escrever o
login primeiro significa pagar projeto para uma tela de entrar que não leva a lugar nenhum.

### Camada 3 — o que depende da conta existir

Pedido de loja (o cliente vê o que pediu), notificação (para quem?), e o perfil como dado
editável — todos os três esperam a camada 2.

---

## 4. O que ainda é decisão de dono

Perguntas de verdade, no sentido da borda do `CLAUDE.md`: a resposta muda o que é
construído, e nenhuma delas vira configuração.

**Uma só, e as outras duas eu tinha empurrado para ele por engano.**

1. **A camada 1 sozinha resolve o mês?** Uma fábrica de seis pessoas com um celular
   compartilhado, PIN e responsável do aparelho funciona **sem servidor nenhum** — o
   livro-razão já grava quem operou. Se isso basta para a F2/F3, a camada 2 pode esperar
   o Espelho da Loja, que é quando alguém de fora precisa entrar. É faseamento, e
   faseamento é decisão de dono.

E as duas que **não** são pergunta, pela borda do `CLAUDE.md`:

- ~~*O PIN é por pessoa ou por aparelho?*~~ — é preferência de quem usa, então **vira
  configuração e os dois caminhos existem**. A única coisa legítima a perguntar seria o
  padrão, e ele já está decidido pela decisão de 1 de setembro: entrada compartilhada é
  *"PIN numa grade de nomes"*, logo **por pessoa** por padrão. Um PIN por aparelho é o
  caso da empresa que não quer distinguir ninguém — liga nos ajustes.
- ~~*Quem redefine um PIN esquecido?*~~ — não há escolha: quem cadastrou a pessoa
  redefine, no aparelho dele, com a mesma permissão que a criou. Perguntar isso era
  pedir permissão para o óbvio.

---

## 5. O que este estudo mudou já — e onde ele mesmo errou

**Primeira versão (6 de setembro, manhã):** a ordem muda, porque a camada 1 não depende
do servidor.

**Correção, no mesmo dia, antes de virar código:** ela depende. A medida está na seção 3.
O estudo acertou em separar as camadas e errou em qual delas vem primeiro — e o erro
seria caro do jeito mais silencioso possível: a grade funcionaria, a foto ficaria bonita,
e o defeito só apareceria no dia em que a sincronia subisse, com a fila travada e a causa
três meses atrás.

**A pergunta que sobra é de faseamento, e é do dono:**

- **(a) Subir o servidor agora**, contra a decisão de *"o servidor sobe o mais tarde
  possível"* — mas com um motivo que não existia quando ela foi tomada: sem ele, não há
  lista de gente, e sem lista de gente não há quem operou.
- **(b) Trocar a forma de `operator_id`** para um texto que não referencia membership,
  resolvido para pessoa depois. Barato no aparelho, **caro e permanente no servidor** —
  é o portão P3 no ponto exato em que ele existe para travar: o caminho de escrita de
  `movements`.
- **(c) Deixar a camada 1 para depois** e seguir para o que não esbarra nisso — o motivo
  da devolução, a tela de conferir item a item, o preço combinado na ficha da loja.

Eu faria **(c)** e depois **(a)**: (b) enfraquece a única coluna que amarra o razão a uma
pessoa, para adiantar uma tela.
