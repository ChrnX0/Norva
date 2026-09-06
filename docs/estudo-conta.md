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

Nada disso pede o servidor, e tudo isso é exercitável com a foto no emulador. **É por aqui
que se começa.**

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

1. **A camada 1 sozinha resolve o mês?** Uma fábrica de seis pessoas com um celular
   compartilhado, PIN e responsável do aparelho funciona **sem servidor nenhum** — o
   livro-razão já grava quem operou. Se isso basta para a F2/F3, a camada 2 pode esperar
   o Espelho da Loja, que é quando alguém de fora precisa entrar.
2. **O PIN é de quatro dígitos por pessoa, ou um por aparelho?** Vira configuração se os
   dois caminhos fizerem sentido — mas o padrão é decisão dele.
3. **Recuperação de acesso sem e-mail pessoal.** Se a conta é da empresa e o operador
   nunca teve e-mail, quem redefine o PIN esquecido é o dono, no aparelho dele. Isso é
   caminho novo, não detalhe.

---

## 5. O que este estudo mudou já

Nada de código. O que ele mudou é a **ordem**: a camada 1 não depende do servidor, é
verificável com a foto, e entrega o `operator_id` que o livro-razão já tem coluna para
guardar. O roadmap dizia "login e conta" como um bloco só — e um bloco só teria começado
pelo Supabase, que é a parte que o dono mandou adiar.
