# A entrada — e o que "sempre offline" pode e não pode significar

Estudo pedido pelo dono em 6 de setembro: *"essa solução de pin… parece boa, mas seria
legal se pudesse ser off-line sempre. tipo aqueles tokens de banco para celular, sabe?"*

Escrito **depois** de medir o repositório, não antes. Cada afirmação sobre o sistema tem
`arquivo:linha`. O que é opinião está marcado como opinião.

---

## 1. O token de banco não é offline — e entender por quê resolve metade da pergunta

O token do banco gera um número de seis dígitos sem internet. Parece offline, e o
aparelho realmente está. Mas o número não vale nada sozinho: **quem confere é o banco**,
online, com o mesmo segredo que foi combinado no dia em que o token foi ativado.

Então a frase certa não é "o token é offline". É: **o token gera offline; o sistema
confere online.** O offline é de um lado só.

Isso importa aqui porque a pergunta certa deixa de ser *"dá para ser offline?"* e passa a
ser **"quem confere, e quando?"**. Toda a análise abaixo é essa pergunta aplicada a cada
pedaço.

---

## 2. O que existe hoje, medido

**Não há autenticação nenhuma.** Não existe cliente de servidor (`package.json` não tem
`@supabase/supabase-js` nem cliente HTTP), não existe tela de login em `app/`, e o motor
de sincronia declara isso no topo: *"The engine knows nothing about Supabase, or HTTP, or
authentication"* (`src/sync/engine.ts:6`). `Transport` é um tipo sem implementação
(`src/sync/engine.ts:35-37`), e `drain()` não tem chamador de produção.

**Não há criptografia nenhuma.** Nem `expo-crypto`, nem `expo-secure-store`, nem
`expo-local-authentication`, nem câmera, nem biblioteca de assinatura — a varredura do
`package-lock.json` por `crypto|secure-store|camera|noble|nacl` devolve zero.

**Os ids são gerados com `Math.random()`** (`src/data/db.ts:933-938`). Têm forma de UUIDv4
e não têm aleatoriedade criptográfica. Hoje é inofensivo: nenhum id é segredo. **No dia em
que um código de convite for gerado assim, ele é adivinhável.**

**Não há onde guardar segredo.** `app_meta` é `(key, value)` em texto puro dentro do
mesmo SQLite (`src/data/db.ts:136-139`), e o banco não é cifrado. A única linha defensiva
do repositório sobre dado em repouso é `"allowBackup": false` (`app.json:19`), que impede
o backup do Android levar o razão para a conta Google de quem estiver no aparelho.

**Desenhar QR existe; ler não.** `src/domain/qr.ts` desenha com JS puro sobre SVG, sem
nada nativo, e a etiqueta do lote já usa (`app/lots/[id].tsx:208`). Ler exige câmera —
módulo nativo, sem implementação web —, e o e2e roda num navegador de verdade. A seção
`scan` do dicionário está registrada como fronteira exatamente por isso
(`src/dictionary.test.ts:46-48`).

---

## 3. A regra que o servidor já impõe — e é ela que decide o desenho

Esta é a medição mais consequente do estudo.

```sql
create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'transfer' then private.has_capability(company_id, 'dispatch')
      ...
    end
  );
```
— `supabase/migrations/0008_ledger_speaks_phase_one.sql:26-41`.

Lido devagar, isso diz duas coisas:

1. **Todo movimento que chega ao servidor é assinado por uma CONTA** (`recorded_by`
   `not null references auth.users`, `0001:191`), e o próprio servidor carimba: ninguém
   assina no nome de ninguém, nem o dono. O `db:verify` já prova
   (`scripts/verify-migrations.sh:383-398`).
2. **A permissão conferida é a da CONTA**, via `has_capability`, que lê
   `memberships.capabilities` (`0011:33-47`).

E aqui está a consequência que eu não tinha visto antes de medir:

> **O perfil da pessoa não é conferido pelo servidor.** `people.profile_id` e
> `profiles.capabilities` (`0035`) são uma camada do aparelho — o que a tela oferece e o
> que o relatório atribui. Quem *impede* é a capacidade da conta em que o celular está
> logado.

Isso não é defeito da `0035`: pessoa e conta são coisas diferentes e continuam sendo.
Mas significa que **um celular logado numa conta com `dispatch` pode despachar,
independentemente do perfil que a tela mostra.** Se a intenção é que o entregador não
possa fazer mais do que despachar e conferir, o teto tem que estar na conta.

---

## 4. As três perguntas que estavam coladas numa só

O projeto já separou "quem gravou" de "quem estava operando" (`0014`), e isso custou uma
rodada. A entrada tem **três** perguntas, e colar duas delas custaria outra:

| pergunta | o que responde | onde mora | quem confere |
|---|---|---|---|
| **Este celular é nosso?** | a empresa e o teto de permissão | conta / sessão | o servidor, quando sincroniza |
| **Quem está com ele agora?** | a atribuição do movimento | `operator_id` → `people` | ninguém — é declaração |
| **O que esta pessoa pode fazer?** | o que a tela oferece | `profiles.capabilities` | o aparelho (conselho), a conta (lei) |

**O PIN responde a segunda, e só ela.** Quatro dígitos num celular que seis pessoas
dividem não são segredo: são um jeito de dizer "sou eu" em dois segundos, de luva, no
frio. Tratá-lo como senha seria mentir sobre a proteção — e a proteção de verdade daquele
aparelho é ele ser da empresa e ficar pendurado na câmara.

Isso não é fraqueza do desenho: é o desenho certo para o caso. O que protege o número não
é o PIN, é o livro-razão ser append-only e a contagem cega existir.

---

## 5. Então: dá para ser sempre offline?

Depende de qual das três perguntas, e a resposta honesta é diferente para cada uma.

### O que já é sempre offline, hoje, sem nenhuma dependência nova

**Tudo o que a fábrica faz.** O app inteiro é local: SQLite no aparelho, e a fila
(`outbox`) guarda o que ainda não subiu. Produzir, transferir, contar, perder, devolver —
nada disso pede rede. A grade de nomes com PIN entra nesse mesmo balde: gente
(`people`) já existe no banco do aparelho, e escolher um nome é uma leitura local.

**Opinião:** para o celular compartilhado da fábrica, essa é a resposta final. Não há o
que melhorar com criptografia, porque não há adversário do outro lado — o aparelho é da
empresa e está dentro dela.

### O que pode ficar offline por muito tempo, mas não para sempre

**O celular do entregador com uma conta.** Ele grava offline como qualquer outro. O que
precisa de rede é a **sessão**: o servidor exige `recorded_by = auth.uid()`, e uma sessão
Supabase é um token que expira e se renova conversando com o servidor.

Na prática: dias ou semanas offline, sim. Para sempre, não — não porque o app não
aguenta, mas porque a credencial que ele carrega tem prazo.

### O que seria "sempre offline" de verdade, e o que custa

O aparelho teria **chave própria**, gerada nele, e **assinaria** cada linha que escreve. A
verificação acontece depois, quando o dado encontrar um verificador — como o token do
banco, ao contrário: o aparelho assina offline, o servidor confere quando puder.

É o desenho tecnicamente correto para "sempre offline", e é mais forte que sessão: uma
assinatura prova a origem mesmo que a linha viaje por três aparelhos até chegar.

O que ele exige, medido contra o que existe:

- **Aleatoriedade de verdade.** `Math.random()` não serve para gerar chave nem código
  (`src/data/db.ts:936`). Entra `expo-crypto`.
- **Um lugar para a chave.** Hoje ela ficaria em texto puro no SQLite. Entra
  `expo-secure-store`, que usa o Keystore do Android.
- **Uma biblioteca de assinatura.** Nenhuma existe. `@noble/ed25519` é JS puro e roda na
  web e no aparelho.
- **Alguém que confira.** E aqui está o custo real: o servidor de hoje **não sabe conferir
  assinatura** — a política olha `auth.uid()`. Conferir exigiria uma função de borda que
  recebe a linha assinada, valida contra a chave pública do aparelho e escreve. Isso é
  construir o caminho de escrita, não configurar um.

**Opinião, e é a parte que eu defendo:** isso não se constrói agora. Não porque seja
difícil, mas porque **a sincronia ainda não existe** — não há transporte, não há cliente,
não há um único movimento que tenha subido. Construir verificação de assinatura antes de
existir o canal é escolher a fechadura antes de ter a porta.

---

## 6. O que nenhum desenho resolve: revogar

Celular perdido, ou pessoa que sai, ou aparelho que alguém levou junto com o emprego.

**Nenhuma criptografia revoga um aparelho que nunca mais conecta.** Sessão com prazo
expira sozinha (bom), mas então não é "sempre offline". Chave própria não expira (bom
para offline), e por isso não revoga (ruim). É uma escolha entre dois males, não um
problema a resolver.

O que dá para fazer, e é onde eu colocaria o esforço:

- **Diminuir o estrago.** O perfil do entregador já é pequeno: `dispatch`,
  `check_receipt`, `record_loss`. Sem custo, sem preço, sem dinheiro, sem gerir empresa.
  Um celular perdido lança carga falsa; não vê margem nem muda preço.
- **Fazer o aparelho ser desligável.** A tabela `devices` existe com `active`
  (`0013:18-40`), e desde a `0035` o responsável é uma **pessoa**. Mas — achado deste
  estudo — **o servidor não confere `device_id` em nada**: a política de inserção não o
  menciona (`0008:26-41`), e a coluna é anulável. Desligar um aparelho hoje não impede
  uma linha dele. Fazer isso valer é uma política, e é barata.
- **Contar com o razão.** Append-only e estornável: uma carga falsa não some, mas se
  desfaz por estorno, com autoria. É a única defesa que já está pronta e testada.

---

## 7. A correção de uma coisa que eu disse ontem

Eu recomendei **código por pessoa, não por perfil**, com o argumento de que por perfil não
dá para revogar individualmente. Medindo o servidor, isso está errado no eixo que importa:

**é a conta que carrega a permissão**, e uma conta por pessoa significa uma conta de
autenticação por operador — exatamente o que a decisão do dono recusa (*"o login autentica
o sistema, não a pessoa"*) e o que a `0035` acabou de desfazer no esquema.

A `0014` já tinha escrito a resposta certa, e eu não a li com atenção: *"a empresa
distribui acesso criando outros e-mails ou mandando código de convite **por perfil**"*.

Então: **conta por PERFIL** (o teto, que o servidor impõe), **pessoa por operador** (a
atribuição, que a tela pergunta), **aparelho por celular** (a revogação, que ainda precisa
de uma política para valer). Três coisas, três lugares, nenhuma fazendo o trabalho da
outra.

---

## 8. O que eu faria, em ordem

1. **A grade de nomes com PIN** — agora, sem dependência nenhuma. É a entrada da fábrica,
   é 100% offline e usa `people`, que já existe. O PIN é atribuição, e a tela deve dizer
   isso em vez de fingir segurança.
2. **`operator_id` ganha escritor** — a coluna existe nos dois lados e atravessa a
   sincronia (`src/sync/serialize.ts:384`), e **nada a preenche**
   (`0035:18-20`). Fechar isso é o que faz o relatório poder dizer "quem", quando a
   empresa liga `names_who_recorded` (`0012:20-21`, coluna que também não tem leitor).
3. **O servidor conferir `device_id`** — quando a sincronia existir. É o que transforma
   `devices.active` de enfeite em revogação.
4. **A conta por perfil e o código de convite** — quando o servidor subir. É a primeira
   peça que realmente precisa dele, e isso também responde *quando* subir.
5. **Chave e assinatura no aparelho** — só se a fábrica de alguém pedir offline de
   semanas. Não antes de existir o canal.

---

## 9. Dois defeitos que apareceram na medição

Ambos pequenos, ambos reais, nenhum deles era o assunto do estudo.

- **`movements.device_id` atravessa a sincronia e não existe no aparelho.** Está na lista
  de colunas que viajam (`src/sync/serialize.ts:374`) e nenhum `ALTER TABLE` do
  `src/data/db.ts` a cria — então ela é serializada como `null`, sempre. O guarda de
  colunas (`src/sync/columns.test.ts`) cobra a direção contrária (coluna do aparelho que
  não atravessa) e não esta.
- **Três configurações de empresa não têm leitor**: `floor_sign_in` (pessoal ou
  compartilhado, `0011:65-68`), `join_code` (`0011:55`) e `names_who_recorded`
  (`0012:20-21`). A escolha entre os dois caminhos de entrada **já está modelada no
  servidor** — o app é que ainda não pergunta.
