## 33. Como se trabalhava aqui: processo, regras de sessão e armadilhas de ambiente

Esta seção descreve o **laço de trabalho** — o que se roda, em que ordem, o que cada
comando prova, quais regras de sessão valiam, e as armadilhas de ambiente que já
foram pagas com horas. Nada aqui é conselho: cada regra existe porque um erro
concreto a produziu, e o erro está nomeado com data.

O documento que governa tudo isto é o `CLAUDE.md` da raiz do repositório, lido no
início de toda sessão (`CLAUDE.md:1-449`). As seções de processo dele são
**A barra de verificação** (`CLAUDE.md:102-181`), **`/insights`**
(`CLAUDE.md:185-220`), **Ultracode** (`CLAUDE.md:224-241`), **Nunca ocioso**
(`CLAUDE.md:245-281`), **Insight constante** (`CLAUDE.md:285-310`) e **Git**
(`CLAUDE.md:442-449`).

---

### 33.1 A barra de verificação — os comandos, na ordem exata

O bloco transcrito literalmente do `CLAUDE.md:107-116`:

```bash
npm run typecheck
npm run lint
npm test
npm run mutate       # quebra o código de propósito: a suíte morde mesmo?
npm run e2e:fast     # o app dirigido num navegador de verdade, em quatro fatias
npm run db:verify    # Postgres descartável, treze garantias — inclui a fila
                     # do aparelho reproduzida contra o servidor de verdade
bash .proofgate/verify.sh
```

A frase que abre o bloco é: *"Antes de dizer que algo está pronto, **rode**. Não é
opcional e não é por amostragem"* (`CLAUDE.md:104-105`).

Os comandos, tal como declarados em `package.json:7-18`:

| script | comando real | fonte |
|---|---|---|
| `typecheck` | `tsc --noEmit` | `package.json:11` |
| `lint` | `expo lint` | `package.json:12` |
| `test` | `tsx --test 'src/**/*.test.ts'` | `package.json:13` |
| `db:verify` | `bash scripts/verify-migrations.sh` | `package.json:14` |
| `e2e` | `node e2e/flow.mjs` | `package.json:15` |
| `mutate` | `node scripts/mutate.mjs` | `package.json:16` |
| `e2e:fast` | `node scripts/e2e-parallel.mjs` | `package.json:17` |
| `shot` | `node scripts/shot.mjs` | `package.json:18` |
| `folha` | `node scripts/folha.mjs` | `package.json:19` |

**As aspas em `'src/**/*.test.ts'` são o defeito, não estilo.** Sem elas o shell
expande antes de o runner ver e, sem `globstar`, lê `**` como um nível só: todo
arquivo em `src/algo/x.test.ts` rodava e um em `src/x.test.ts` **não existia para a
suíte** — 131 testes antes e 131 depois de escrever um arquivo novo
(`docs/insights.md:799-813`). Virou guard da proofgate, `47-unquoted-globstar`
(`.proofgate/guards.d/47-unquoted-globstar.sh`).

#### 33.1.1 Os números que a barra tinha na última medição

Derivados do repositório no estado documentado (comandos entre parênteses):

| peça | número | como se deriva |
|---|---|---|
| `npm test` | **338** testes em **42** arquivos | soma de `^test(` em `src/**/*.test.ts` |
| `npm run mutate` | **106** defeitos plantados — 104 pegos, 2 equivalentes | `^ {4}file: '` em `scripts/mutate.mjs` |
| `npm run e2e:fast` | **36** checagens de navegador | `^check(` em `e2e/flow.mjs` |
| `npm run db:verify` | **13** garantias | `^echo "==> check ` em `scripts/verify-migrations.sh` |
| `.proofgate/verify.sh` | **25** arquivos de guard | `ls .proofgate/guards.d/*.sh` |
| telas | **24** | `.tsx` em `app/` que não começa com `_layout` |
| tabelas no aparelho (SQLite) | **21** | `CREATE TABLE IF NOT EXISTS` em `src/data/db.ts` |
| tabelas no servidor (Postgres) | **22** | `^create table` em `supabase/migrations/*.sql` |
| migrações do servidor | **32** | arquivos em `supabase/migrations/` |
| migração do aparelho | **V17** | último `const V` em `src/data/db.ts` |

Os quatro primeiros da barra, mais telas, tabelas, migrações, papéis e capacidades,
são **conferidos por teste** contra o que os documentos afirmam — ver §33.5
(`src/bar.test.ts`).

**Uma divergência real, e ela é do tipo que a §33.5 existe para pegar:** o
`docs/roadmap.md:48` afirma *"`.proofgate/verify.sh` | **24** guardas de entrega"* e
existem **25** arquivos em `.proofgate/guards.d/*.sh`. Essa linha **não está** na
lista `TABELA` de `src/bar.test.ts:121-137`, então nada a conferia. O comentário do
CI é ainda mais velho: diz *"Nineteen guards over the diff itself"*
(`.github/workflows/ci.yml:67`). É a mesma doença descrita em
`docs/insights.md:2896-2944`, com o antídoto escrito ao lado e não aplicado àquela
linha.

---

### 33.2 O que cada comando da barra prova, e por que existe

#### 33.2.1 `npm run mutate` — a suíte morde mesmo?

Quebra o código de propósito, um defeito por vez, roda a suíte, e **falha se algum
defeito passar despercebido** (`scripts/mutate.mjs:1-23`).

Existe por um resultado da primeira execução: trocar o `Math.round` do `amountOf`
por `Math.floor` — *o* ponto de arredondamento do sistema — deixou **noventa e dois
testes verdes** (`CLAUDE.md:141-145`, `scripts/mutate.mjs:17-20`). A regra da capa
do projeto estava sustentada por coincidência aritmética.

A lista é **curada, não aleatória** — cada entrada carrega o campo `hurts`, uma
frase sobre o que daria errado *na fábrica* se aquilo passasse
(`scripts/mutate.mjs:9-15`, `scripts/mutate.mjs:30`). Forma de cada entrada:

```js
{ file: 'src/domain/cost.ts', from: '<trecho>', to: '<trecho mutado>',
  hurts: 'o que a fábrica perde se isto passar' }
```

Mecânica, com todas as cicatrizes embutidas:

| peça | comportamento | por quê |
|---|---|---|
| `OFICINA` | copia o projeto para `.mutate/w0..wN` e muta a **cópia** | nunca tocar a árvore de trabalho (`scripts/mutate.mjs:966-968`) |
| `TRABALHADORES` | `max(1, min(cpus, 4))` | 64 mutações em série custavam 12 min (`scripts/mutate.mjs:960-968`) |
| `node_modules` | **link simbólico**, não cópia | centenas de MB lidos e não escritos (`scripts/mutate.mjs:963-964`) |
| `NAO_COPIAR` | lista de **exclusão**: `node_modules`, `.git`, `.mutate`, `dist`, `.expo`, `.shots`, `android` | ver abaixo (`scripts/mutate.mjs:991-999`) |
| `oficinaConfere()` | roda a suíte **sem mutação** e aborta se ela não passar | oficina quebrada e suíte perfeita são indistinguíveis (`scripts/mutate.mjs:1014-1042`) |
| `conferirRegua()` | quatro casos sintéticos validam o leitor de saída antes de qualquer medida | `scripts/mutate.mjs:1071-1092` |
| `lerSuite()` | **três** estados: `passou` / `falhou` / `inconclusivo` | `scripts/mutate.mjs:1064-1069` |
| `suitePasses()` | segunda chance **só** para `inconclusivo` | medida que não houve é barata de repetir; resultado que houve não se repete (`scripts/mutate.mjs:1095-1108`) |
| `julgar()` | recusa mutação cujo `from` aparece **mais de uma vez** (`estado: 'ambigua'`) | `String.replace` troca a primeira e cala sobre o resto (`scripts/mutate.mjs:1121-1129`) |
| marcador `equivalente` | mutação que nenhum teste possível distingue; **se for pega, vira erro** (`MARCADOR ERRADO`) | senão a lista apodrece guardando desculpa (`scripts/mutate.mjs:1140-1157`) |

**A cicatriz da lista de inclusão (4 de setembro).** `COPIAR` era
`['src', 'scripts', 'package.json', 'tsconfig.json']`, escrita em 3 de setembro
quando os testes só liam `src/`. Depois disso a suíte ganhou guardas que leem o
repositório inteiro: o dicionário varre `app/`, os seletores leem `e2e/flow.mjs`, o
acordo lê `supabase/migrations`, a tabela lê `CLAUDE.md` e `docs/roadmap.md`. Na
oficina esses arquivos não existiam, os testes morriam no carregamento com `ENOENT`,
e a suíte da oficina saía com **`# fail 19` sem mutação nenhuma**. Como
`pego = !suitePasses(dir)` e `suitePasses` procurava `# fail 0`, **toda** mutação era
declarada pega sem a suíte jamais ter sido consultada — por **66 commits**
(`docs/insights.md:2945-3019`, `scripts/mutate.mjs:970-990`).

Com a oficina consertada, **seis mutações sobreviveram**: `blendRate` trocada por
`return arriving.rate`; a contagem de movimentos na confirmação de apagar compras;
a corrida aberta gravando `product.recipeId` na coluna da versão; e o `NAO_ESTORNADO`
sumindo da consulta de "produzido no período" — mais dois equivalentes
(`docs/insights.md:2984-3003`).

**A terceira aparição da mesma forma.** `suitePasses` era
`return stdout.includes('# fail 0')`: toda execução que **não imprime resumo** caía
no lado "falhou", e "falhou" queria dizer "pegou". Numa máquina de quatro núcleos com
quatro frentes de mutação e um `npm test` rodando junto, uma execução não terminou e
virou proteção — o relatório acusou `MARCADOR ERRADO` num marcador correto
(`docs/insights.md:3234-3272`). A regra que ficou, transcrita:

> **Instrumento que só distingue dois estados chama ausência de medida de resultado
> favorável.** "Passou" e "não passou" parecem exaustivos e não são: falta "não
> mediu". E o default silencioso cai sempre para o lado que agrada — num portão de
> mutação, "pegou"; num de permissão, "autorizado"; numa checagem de saldo, "tem".
> (`docs/insights.md:3253-3258`)

**Onde a regra tem de morar para o `mutate` alcançá-la.** `scripts/mutate.mjs` roda
`npm test`, a suíte rápida — **regra dentro de um componente React nunca é alcançada
por ele**, por mais e2e que se escreva. Daí a regra de arquitetura: *toda decisão que
merece um mutante mora no domínio; se está numa tela, ou não merece o mutante, ou
está no lugar errado*. `pickSuggestion` e `qrPath` nasceram desse critério
(`docs/insights.md:1806-1843`).

**Sabotagem equivalente não prova nada.** Trocar `GROUP BY m.location_id` por
`GROUP BY l.name, l.kind` passou — e passou pelo motivo certo: no teste cada lugar
tinha nome distinto. *A sabotagem precisa alterar o resultado, não só o texto*
(`docs/insights.md:1180-1196`).

#### 33.2.2 `npm run e2e:fast` — o app dirigido num navegador de verdade

Existe porque três bugs passaram por toda a bateria unitária e só apareceram com o
app aberto: **uma confirmação que não existe na web** (`Alert` é no-op ali, então toda
confirmação perguntava para ninguém), **rotas que abriam num banco vazio**, e **uma
tela falando dois idiomas** (`CLAUDE.md:147-150`, `e2e/flow.mjs:9-23`).

`scripts/e2e-parallel.mjs` faz **um export só** e fatia as checagens:

- `FATIAS = max(1, min(cpus, 4))` (`scripts/e2e-parallel.mjs:25`)
- `PORTA_BASE = E2E_PORT ?? 4300`; cada fatia sobe o próprio servidor na sua porta
  (`scripts/e2e-parallel.mjs:26`, `scripts/e2e-parallel.mjs:57-59`)
- as fatias rodam `node e2e/flow.mjs --shard n/N` com `E2E_REUSE_BUILD=1`
  (`scripts/e2e-parallel.mjs:55-60`)
- **uma fatia vermelha derruba a execução inteira** — *"a suíte é um veredito só, e
  'três de quatro fatias passaram' não é um veredito"* (`scripts/e2e-parallel.mjs:19-21`)
- a saída sai **na ordem das fatias**, não na de quem terminou: relatório fora de
  ordem não se compara com o de ontem (`scripts/e2e-parallel.mjs:66-67`)

O fatiamento é por **resto da divisão**, não por bloco contíguo, porque as checagens
têm durações muito diferentes — a que cadastra produto e produz leva quinze vezes o
tempo da que só abre uma tela (`e2e/flow.mjs:43-53`).

`npm run e2e` (sem `:fast`) continua existindo e serve para **uma checagem só**
(`--only <pedaço do nome>`), que é o laço de trabalho (`CLAUDE.md:132-133`,
`e2e/flow.mjs:27-40`). Um `--only` que não casa com nada **falha** em vez de imprimir
`0/0 passaram` — *"a forma de todo defeito silencioso deste arquivo: um mecanismo
relatando sucesso sem ter trabalhado"* (`e2e/flow.mjs:33-36`). Suíte vazia virou falha
com código de saída **1**, provado esvaziando o registro de checagens
(`docs/insights.md:838-844`).

O navegador: `playwright-core` procura o build numerado que ele fixa, que estas
máquinas não podem baixar. A ordem é `E2E_CHROMIUM` → `/opt/pw-browsers/chromium` →
o palpite do Playwright — *"uma suíte que parece quebrada é uma suíte que as pessoas
param de rodar"* (`e2e/flow.mjs:70-83`).

**Asserção se escreve da REGRA, não da saída.** Duas asserções exigiam `41.1%` porque
foram escritas copiando o que a tela imprimia — e o que a tela imprimia era o ponto
decimal do JavaScript numa fábrica brasileira. As duas estavam verdes por semanas,
travando o defeito no lugar. *"Português escreve porcentagem com vírgula" é uma regra
e sobrevive a qualquer refatoração; `41.1%` é uma fotocópia*
(`docs/insights.md:3501-3514`).

**Nenhuma afirmação pode cobrar a AUSÊNCIA de algo que o ambiente possa acrescentar.**
Uma checagem afirmava que numa instalação virgem *nenhuma peça da capa convida* para
abrir. Passava na máquina de desenvolvimento e reprovava no runner — a diferença era
a **rede**: aqui a previsão do tempo não é alcançada e o cartão não existe; no runner
ela é alcançada e o cartão aparece, convidando com razão
(`docs/insights.md:2107-2132`).

#### 33.2.3 `npm run db:verify` — treze garantias contra um Postgres descartável

`scripts/verify-migrations.sh` sobe um Postgres próprio (`initdb` + `pg_ctl`), aplica
**todas** as migrações byte a byte, e verifica comportamento — *"'as tabelas foram
criadas' não prova nada"* (`scripts/verify-migrations.sh:1-17`).

Detalhes operacionais que um recomeço precisa reproduzir:

- `PGBIN` padrão `/usr/lib/postgresql/16/bin`, `PGDATA` `/tmp/norva-verify-db`,
  `PGPORT` `55432`, banco `norva_verify` (`scripts/verify-migrations.sh:21-25`).
- **Postgres recusa rodar como root**, comum em contêiner e CI: o script cria/usa um
  usuário `pgverify` e roda o servidor por ele (`scripts/verify-migrations.sh:27-34`).
- `trap cleanup EXIT` para nada ficar rodando (`scripts/verify-migrations.sh:37-41`).
- O Supabase fornece `auth.users` e `auth.uid()`; o script **finge os dois** para as
  migrações rodarem sem edição, e `auth.uid()` lê um GUC (`test.uid`) — é isso que
  permite consultar *como um dado usuário* e ver o RLS decidir
  (`scripts/verify-migrations.sh:56-72`).

As treze checagens, com os títulos exatos que o script imprime:

| # | título | linha |
|---|---|---|
| 1 | the ledger refuses UPDATE and DELETE | `scripts/verify-migrations.sh:99` |
| 2 | a purchase moves the moving average, keeping precision | `:124` |
| 3 | a product cannot be half-manufactured | `:176` |
| 4 | one company cannot see another, and an operator cannot see money | `:202` |
| 5 | the ledger accepts what phase 1 actually records | `:318` |
| 6 | a fila do aparelho chega inteira, e os dois lados fecham o mesmo número | `:417` |
| 7 | a grade do produto recusa o cadastro impossível | `:560` |
| 8 | o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova | `:637` |
| 9 | o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu | `:688` |
| 10 | o razão recusa item e local de outra empresa | `:732` |
| 11 | o aparelho emprestado cria o lugar padrão, e nada além dele | `:773` |
| 12 | a leitura da câmara sobe duas vezes, e a segunda não reescreve nada | `:812` |
| 13 | quem aprova um pedido não reescreve quem o anotou | `:849` |

A frase final do script é `all thirteen guarantees hold` — e ela é **conferida por
teste** contra a contagem real de blocos `==> check N:` (`src/bar.test.ts:88-98`).

**A checagem 6 mudou o que o job precisava, e não avisou.** Ela roda uma sessão de
aparelho em TypeScript (`scripts/device-session.ts`) para produzir a fila que
reproduz. O job do banco no CI nunca tinha rodado `npm ci` — era bash e `psql`. Três
pushes seguidos: verde local, vermelho no CI, com `Cannot find module '@/data/db'`
depois de o `npx` anunciar que ia baixar o `tsx` (`docs/insights.md:367-386`,
`.github/workflows/ci.yml:105-115`).

#### 33.2.4 `bash .proofgate/verify.sh` — o portão de entrega

Flags declaradas no cabeçalho (`.proofgate/verify.sh:5-14`):

| flag | efeito |
|---|---|
| (nenhuma) | portão rápido, sem build |
| `--build` | inclui o build (pré-release) |
| `--strict` | avisos viram falhas |
| `--smoke` | roda também as checagens de fumaça de produção |
| `--json` | veredito em JSON no stdout (logs vão para stderr) |
| `--only <guard>` | roda um guard só (**não escreve veredito**) |
| `--dry-run` | mostra o que rodaria, não roda nada |
| `--base <ref>` | base do diff (padrão: merge-base com o branch default do origin) |
| `--report <arquivo>` | escreve também um relatório markdown |

Códigos de saída: **0** = passou (avisos permitidos, salvo `--strict`) · **1** =
FALHOU (`.proofgate/verify.sh:16`).

Toda execução completa escreve um veredito legível por máquina em
`$(git rev-parse --git-dir)/proofgate-verdict.json` — **dentro do `.git`**, para nunca
ser commitado (`.proofgate/verify.sh:18-21`). É esse arquivo que o `push-guard` lê.

Regra de leitura, do `CLAUDE.md:177-178`: **qualquer ❌ significa que não está pronto**,
e **todo ⚠️ pede justificativa escrita — nunca dispensa em silêncio**.

Guards presentes em `.proofgate/guards.d/` (25 arquivos, ordem alfabética de execução):

| arquivo | o que pega |
|---|---|
| `10-secrets.sh` | linhas com cara de credencial |
| `12-merge-markers.sh` | marcadores de merge |
| `15-tls-off.sh` | verificação TLS desligada |
| `20-pii-logging.sh` | dado pessoal indo para log |
| `25-silent-catch.sh` | `catch` que engole |
| `30-untested-changes.sh` | fonte mudou, **zero** arquivos de teste tocados (WARN) |
| `35-dependency-change.sh` | mudança de dependência |
| `40-env-drift.sh` | variável de ambiente nova sem par |
| `45-broad-process-kill.sh` | `pkill`/`killall`/`taskkill /IM` — matar por padrão |
| `47-unquoted-globstar.sh` | `**` sem aspas em script |
| `48-pipeline-exit-code.sh` | código de saída perdido num pipe |
| `50-coupled-files.sh` | arquivos que mudam juntos e só um mudou |
| `55-skipped-tests.sh` | teste focado/pulado que desliga a suíte em silêncio |
| `58-frozen-clock.sh` | relógio congelado |
| `60-large-files.sh` | arquivo grande |
| `65-type-suppressions.sh` | supressão de tipo |
| `70-debug-leftovers.sh` | sobra de depuração |
| `75-machine-paths.sh` | caminho absoluto de máquina |
| `85-float-money.sh` | dinheiro passando por float |
| `90-sql-concat.sh` | SQL montado por concatenação |
| `92-superuser-verification.sh` | verificação feita como superusuário |
| `95-schema-constraint-no-migration.sh` | restrição de esquema sem migração |
| `96-version-bump-no-release.sh` | versão subiu sem release |
| `97-migration-edited.sh` | migração existente editada ou removida |
| `99-dead-allow.sh` | `proofgate-allow` que não suprime nada |

Dois deles são cicatrizes deste repositório e estão documentados no próprio arquivo:

- `45-broad-process-kill.sh` — *"`pkill -f "verify.sh"` foi rodado para parar uma
  verificação velha. Matou também a que tinha acabado de começar... e a saída que
  voltou parecia um crash em vez de um suicídio, que é a parte cara: os vinte minutos
  seguintes foram depurar um fantasma"* (`.proofgate/guards.d/45-broad-process-kill.sh:3-12`).
- `99-dead-allow.sh` — o marcador `proofgate-allow` é casado contra a **linha
  adicionada em si**; escrito na linha de comentário acima do código, não suprime
  nada *"enquanto se lê exatamente como um achado tratado"*
  (`.proofgate/guards.d/99-dead-allow.sh:3-14`). Nasceu de um erro da própria
  ferramenta sobre si mesma (`CLAUDE.md:372-376`, `docs/insights.md:598-617`).

`97-migration-edited.sh` sabe distinguir o **diretório** do **nome**:
`scripts/verify-migrations.sh` verifica migrações, não é uma — *"um guard que não
sabe distinguir os dois é desligado pela primeira pessoa que ele irrita"*
(`.proofgate/guards.d/97-migration-edited.sh:22-27`).

**A proofgate lê `base..HEAD`, não a árvore de trabalho.** Marcador de justificativa
em arquivo sem commit não existe para ela: **commit primeiro, depois confira**
(`CLAUDE.md:165-167`). E há um aviso `sourceless-diff` para quando o diff guardado
não tem nenhum arquivo de código: nesse caso os ✅ dos guards de diff querem dizer
*"não havia o que olhar"*, não *"nada errado"* (`.proofgate/verify.sh:280`).

**Diretriz de crescimento, transcrita:** *"Toda vez que um erro aqui vira um padrão
que um script pegaria, ele vira guard no repositório dela (`ChrnX0/proofgate`), com
teste positivo e negativo, e sobe por PR. Conselho eu esqueço na próxima sessão;
guard roda sozinho."* (`CLAUDE.md:372-376`).

---

### 33.3 O `push-guard`: o portão que passou a valer sozinho

**O motivo, com data.** Duas vezes num dia o commit foi encadeado numa linha separada
da verificação e empurrado sem ler a saída — a primeira com o shellcheck reclamando
de um padrão redundante, a segunda com uma **mutação sobrevivente** que o próprio
`mutate` tinha acabado de imprimir. O CI pegou a segunda três minutos depois
(`CLAUDE.md:169-171`, `docs/insights.md:880-901`).

A conclusão registrada: *"Isso não se conserta com atenção. Regra que depende de
atenção é regra que falha no dia cansado — e o dia cansado é exatamente quando o erro
custa caro."*

**Onde ele está instalado.** Como hook `PreToolUse` com `matcher: "Bash"`, rodando
`bash .proofgate/hooks/push-guard.sh` (`.claude/settings.json:93-99`).

**Por que hook do agente e não hook do git**, transcrito do próprio arquivo: *"o
adversário aqui é o AGENTE, e um hook de git é trivialmente pulado com
`git push --no-verify`... Este hook vê o comando CRU que o agente vai rodar, ANTES do
git, então `--no-verify` não escapa — e a tentativa de contorno é sinalizada
explicitamente."* (`.proofgate/hooks/push-guard.sh:4-9`).

O algoritmo, passo a passo (`.proofgate/hooks/push-guard.sh:19-79`):

1. **Pré-filtro barato** — o hook dispara em *toda* chamada de Bash; se a carga não
   contém `push`, sai na hora (`:22`).
2. `PROOFGATE_HOOK_OFF=1` sai imediatamente (`:23`).
3. Extrai `tool_input.command` do JSON de stdin com `jq` → `python3` → `node`; sem
   parser, sai permitindo (`:29-41`).
4. Confirma que é mesmo um `git push`, aceitando flags globais antes de `push` (`:44`).
5. **Opt-in:** só guarda repositório que adotou a proofgate (`proofgate.json` ou
   `.proofgate/`) (`:47-54`). `"pushGuard": false` desliga (`:52-54`).
6. **Anti-bypass:** `--no-verify` ou `core.hooksPath` no comando → **bloqueia e nomeia
   a tentativa**, saída 2 (`:57-60`).
7. **Frescor:** lê `$(git rev-parse --git-dir)/proofgate-verdict.json`; libera só se
   `sha == HEAD` **e** `"pass":true` (`:63-72`).
8. Senão bloqueia com razão acionável e saída 2 (`:74-76`).

**É fail-open por construção**: qualquer erro de parse, ferramenta ausente ou estado
inesperado termina em `exit 0` — *"um guard quebrado nunca pode travar o agente"*
(`.proofgate/hooks/push-guard.sh:12-14`, `:79`).

**Dois desligamentos, ambos documentados:** `proofgate.json` com `"pushGuard": false`,
ou `PROOFGATE_HOOK_OFF=1` (`CLAUDE.md:174-175`,
`.proofgate/hooks/push-guard.sh:16-17`).

**NÃO ESTÁ NO CÓDIGO:** não existe `proofgate.json` na raiz deste repositório
(`find . -name proofgate.json` fora de `node_modules` e `.mutate` não retorna nada).
O opt-in acontece pela existência do diretório `.proofgate/`, e toda configuração cai
nos padrões — `timeoutSeconds` 900 (`.proofgate/verify.sh:55`), `sourceGlobs`
`src/|lib/|app/` (`.proofgate/guards.d/30-untested-changes.sh:11`).

---

### 33.4 A espera medida — 3 de setembro

**O achado:** a barra inteira levava perto de meia hora por commit, e quase tudo era
**partida de processo** — o `mutate` abria 64 vezes a suíte em série, o `e2e` rodava
30 checagens uma atrás da outra, e cada guard da proofgate abria **um `grep` por linha
adicionada**; com 31 mil linhas no diff, mais de um milhão de processos por execução
(`CLAUDE.md:118-122`).

A tabela, transcrita de `CLAUDE.md:124-128`:

| | antes | depois |
|---|---|---|
| portão da proofgate | ~8 min | **22 s** |
| `mutate` (64 mutações) | 12 min | 6 min |
| `e2e` (30 checagens) | 7 min | 2 min 40 |

Duas consequências escritas para não se perderem (`CLAUDE.md:130-139`):

- **`e2e:fast` exporta uma vez e fatia as checagens.** O `npm run e2e` continua
  existindo para uma checagem só (`--only`), que é o laço de trabalho. *"Reusar `dist`
  **porque ele existia** já fez a suíte passar verde para uma tela que não tinha a
  mudança — no `e2e:fast` o pacote é sempre o da execução."*
- **O `mutate` nunca mais toca a árvore de trabalho.** Copia o código para `.mutate/`
  e muta a cópia. *"As três redes que existiam contra 'deixar uma mutação no disco' —
  `finally`, ganchos de sinal, e a checagem de árvore suja que abortava a execução
  seguinte — eram três redes para um abismo que não precisava existir."*

O custo de olhar também foi medido e encolhido: cada `npm run shot` exportava o
aplicativo inteiro (perto de **um minuto e meio**), e refazer um desenho pede dez
olhadas — *"a ferramenta de olhar cobrava quinze minutos de espera para quinze
segundos de conserto, e ferramenta cara é ferramenta que não se usa — que é como a capa
foi publicada com um degradê cor de lama"* (`scripts/manifesto.mjs:57-64`).

---

### 33.5 Todo número que o projeto afirma sobre si, conferido — `src/bar.test.ts`

**A cicatriz dupla, no mesmo dia (4 de setembro).** O `CLAUDE.md` — o arquivo que toda
sessão lê primeiro — dizia *"Postgres descartável, **oito** garantias"* no dia em que o
`db:verify` passou a ter nove. E a tabela do `docs/roadmap.md`, escrita naquela manhã
sob o título *"onde o produto está hoje — **medido, não afirmado**"*, estava velha em
**quatro linhas** antes do fim da tarde: 26 migrações contra 27, 303 testes contra 309,
88 mutações contra 90, 8 garantias contra 9 (`docs/insights.md:2896-2944`).

A regra que saiu, transcrita: *"**Documentar a forma de conferir não é conferir.** Todo
número que um documento afirma sobre o sistema é um segundo autor da mesma verdade, e o
segundo autor sempre atrasa. Ou o número sai de uma derivação, ou ele tem uma guarda — a
terceira opção, que é confiar em quem escreveu, é a que produziu as duas cicatrizes de
hoje com o antídoto escrito ao lado."* (`docs/insights.md:2940-2944`).

`src/bar.test.ts` **é aquela coluna, executada** (`src/bar.test.ts:6-34`). O que ele
confere:

| teste | o que compara |
|---|---|
| `the database checks are numbered without a gap` | os `==> check N:` são 1..N sem pular nem repetir (`src/bar.test.ts:76-86`) |
| `the script says how many guarantees it actually has` | a frase `all <n> guarantees hold` bate com a contagem real (`:88-98`) |
| `CLAUDE.md states the number of guarantees the script really has` | `Postgres descartável, <n> garantias` bate (`:100-114`) |
| `every number the plan states about the system is the number the system has` | as 10 linhas de `TABELA` (`:121-137`) derivadas do sistema contra `docs/roadmap.md` (`:158-179`) |

Os números por extenso são escritos em português (`POR_EXTENSO`, `src/bar.test.ts:59-63`)
e inglês (`IN_WORDS`, `:64-69`), porque o `CLAUDE.md` escreve em português e o script
imprime em inglês.

**A fronteira, escrita no arquivo:** *"ela confere o que foi **registrado**, não descobre
o que não foi. Uma linha nova na tabela sem entrada na guarda não quebra nada."*
(`src/bar.test.ts:112-120`, `docs/insights.md:2932-2935`). É exatamente por essa fronteira
que a linha das 24 guardas da proofgate envelheceu (§33.1.1).

**O que ele explicitamente não faz:** não roda o `db:verify` nem o `mutate` — *"isso custa
um Postgres e seis minutos"*. Lê os arquivos, que basta para a única coisa fácil de errar:
acrescentar uma peça e esquecer de contar (`src/bar.test.ts:30-33`).

Ele foi provado antes de ser acreditado: com o número velho no `CLAUDE.md` reprova nomeando
o certo e o escrito; com uma décima checagem acrescentada ao script reprova em **duas**
asserções ao mesmo tempo (`docs/insights.md:2928-2931`).

---

### 33.6 O portão de julgamento: E0 → E4

Depois do portão mecânico vem o de julgamento (`CLAUDE.md:179-181`), transcrito:

> Diga em que nível a afirmação central se sustenta (**E0 acreditado → E3 exercitado de
> verdade → E4 visto em produção**), com o comando que provou. **"Compilou" não é
> "funciona".**

O nível registrado para o produto inteiro era **E3** — *"exercitado contra Postgres e
navegador de verdade, com as telas fotografadas nos dois temas e nas duas identidades.
**Nada visto numa fábrica.**"* (`docs/roadmap.md:51-54`, `docs/auditoria.md:252-253`).

**NÃO ESTÁ NO CÓDIGO:** os níveis **E1** e **E2** nunca são nomeados em lugar nenhum do
repositório. Só E0, E3 e E4 aparecem, e apenas com essas glosas de uma palavra.

**A cicatriz que dá sentido à escala.** Um APK foi publicado como release, verificado
pela API (artefato presente, sha256 certo), e anunciado ao dono como pronto para baixar.
Ele tentou: **404**. O repositório é privado e artefato de release privado exige sessão
logada; o `curl` da verificação respondia 200 porque **o proxy do ambiente injeta
credencial** — *"eu testei por um caminho autenticado e concluí sobre um caminho anônimo"*
(`docs/insights.md:1046-1058`). É a mesma família do guard
`92-superuser-verification.sh`.

---

### 33.7 As ferramentas de olhar (e por que elas existem)

Nenhuma delas está na barra obrigatória; são ferramentas de trabalho.

#### `npm run shot` — `scripts/shot.mjs`

*"Tira foto da tela, para alguém poder OLHAR."* Existe por uma cicatriz de 3 de setembro:
uma capa entregue com cinco cartões dos quais quatro não diziam nada, e um desenho com a
fábrica, a geladeira e o morango em linhas de base diferentes — *"a suíte inteira estava
verde — 283 testes, 70 mutações, 32 checagens no navegador — porque **nenhuma delas olha
para como fica**"* (`scripts/shot.mjs:1-17`).

| flag | efeito | linha |
|---|---|---|
| `--rota /x,/y` | rotas específicas, separadas por vírgula | `scripts/shot.mjs:76-78` |
| `--tudo` | as 21 rotas de `TODAS`, nas duas caras e nos dois esquemas, com dado | `:66-76` |
| `--com-dado` | semeia movimento antes de fotografar | `:79` |
| `--escuro` / `--claro` | um esquema só; **o padrão são os dois** | `:88-111` |
| `--largura N` | largura do aparelho; padrão **412**, e **360** é o Android que uma fábrica de seis pessoas compra | `:91-103` |

Saída em `.shots/`, ignorado pelo git — *"são para olhar agora, não para versionar"*
(`scripts/shot.mjs:14-16`, `.gitignore`).

**As três cegueiras do mesmo dia (4 de setembro)**, e a regra que saiu delas
(`docs/insights.md:3473-3499`):

1. **Idioma.** `npm run shot` morreu procurando o campo "Procurar cidade": o navegador
   headless é `en-US` e, desde que o idioma virou escolha da empresa, o app abre em inglês.
   *A ferramenta parou de funcionar por causa de um conserto feito três horas antes.*
2. **Luz.** `--escuro` ajustava o `colorScheme` do navegador. O app passou a ter escolha
   própria com padrão claro — então a foto do escuro saía **idêntica à do claro**. *"Esta é
   a pior das três: a ferramenta não falhou, ela **mentiu**."*
3. **Largura.** Fotografava 412 px e só. O corte que o dono viu — "Transpo…", "Relatóri…" —
   **não existe a 412**; a 360 aparece na primeira foto.

> **A regra que fica:** quando uma preferência deixa de ser do aparelho e passa a ser do
> aplicativo, **toda ferramenta que dirige o aplicativo de fora fica cega no mesmo
> instante** — e a cegueira é silenciosa, porque a ferramenta continua produzindo uma
> imagem. E: **instrumento que só olha um tamanho é cego para todo defeito que depende de
> tamanho**, que é metade dos defeitos de tela. (`docs/insights.md:3492-3499`)

#### `npm run folha` — `scripts/folha.mjs`

Monta uma folha de contato: muitas fotos numa imagem só, seis por linha com o nome
embaixo. *"`npm run shot` responde 'esta tela está certa?'. Esta responde outra coisa:
**as telas parecem do mesmo aplicativo?** Incoerência não aparece olhando uma de cada vez —
aparece quando elas estão lado a lado."* (`scripts/folha.mjs:1-13`). Uso:
`npm run folha` ou `npm run folha -- organico-escuro`; sai em `.shots/folha-<filtro>.png`.

#### `node scripts/icons.mjs`

Desenha as seis superfícies do ícone a partir do `markPath` de `src/config/brand.ts`, sem
dependência nova (aritmética + `zlib` do node). **Recusa o que não entende**: lê o caminho
e confere que as duas pontas estão à distância do raio declarado — *"a falha silenciosa
aqui é desenhar um ícone errado com exit zero, e ninguém confere um ícone que o script
disse ter escrito"* (`scripts/icons.mjs:1-26`).

---

### 33.8 O CI — `.github/workflows/ci.yml`

**Princípio declarado:** *"A barra que todo push tem de vencer. É deliberadamente a mesma
que uma pessoa roda localmente — uma checagem que só existe no CI se afasta do que os
contribuidores realmente fazem, e aí ninguém confia em nenhuma das duas."*
(`.github/workflows/ci.yml:3-5`).

Gatilho: `push` em `main` **e** todo `pull_request` — *"não os dois para o mesmo commit:
um branch com PR aberto rodaria a barra inteira duas vezes, o que custa minutos e torna um
check vermelho ambíguo sobre a qual execução ele pertence"* (`.github/workflows/ci.yml:6-11`).

| job | nome | passos |
|---|---|---|
| `app` | types, tests, bundle | `npm ci` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run mutate` · `npx expo export --platform android` |
| `gate` | proofgate | checkout com `fetch-depth: 0` (o portão lê o diff contra a base) · `npm ci` · `bash .proofgate/verify.sh` |
| `browser` | the app, driven the way a person drives it | `npm ci` · `npx playwright install --with-deps chromium` · `npm run e2e` |
| `schema` | the database keeps its promises | `npm ci` · localizar `PGBIN` (`ls -d /usr/lib/postgresql/*/bin \| tail -1`) · `npm run db:verify` |

O bundle Android existe porque *"typecheck prova que o código é consistente; só empacotar
prova que ele consegue chegar a um telefone"* (`.github/workflows/ci.yml:44-45`).

Existe também `.github/workflows/build-apk.yml`, que compila o APK neste repositório
(`npx expo prebuild --platform android --no-install` + gradle) — coberto na seção de build
e entrega deste dossiê.

---

### 33.9 `/insights`: o comando reservado ao usuário, e por que ele veio cego

**A regra de propriedade.** `/insights` gera um relatório sobre as sessões do projeto e
**é reservado ao usuário** — está marcado como `disable-model-invocation`, então Claude
não consegue rodá-lo nem deve reproduzir o que ele faz por outro caminho
(`CLAUDE.md:185-189`).

**A diretriz de mão dupla** (`CLAUDE.md:191-220`), transcrita em pontos:

1. **O usuário roda com frequência** — é a única leitura de fora sobre como o trabalho
   está indo: onde o tempo foi, o que se repetiu, o que deu errado mais de uma vez.
2. **Claude age sobre o que ele mostra.** *"Achado de `/insights` não é conversa: vira
   mudança no código, no `CLAUDE.md` ou na barra de verificação, do mesmo jeito que um ⚠️
   da proofgate exige justificativa escrita. Padrão que aparece duas vezes num relatório é
   dívida, não coincidência."*
3. **O resultado é dito na tela, na mensagem seguinte.** O comando obriga uma resposta de
   texto fixo no turno em que roda. A mensagem logo depois traz sempre: o que virou mudança
   e onde, o que foi recusado e por quê, e **o que o relatório errou**. *"Relatório é
   leitura de fora, não autoridade: já aconteceu de ele dizer que um PR fechou sem os
   checks verdes quando tinha fechado cinco de cinco."*
4. **Antes de tudo: confira se ele viu alguma coisa.**
5. **O relatório vem junto, em texto, não como link.** O comando devolve um `file:///root/…`
   que só abre na máquina onde a sessão roda; o dono lê no celular e lá o link não abre nada.
   A mensagem seguinte **transcreve** o relatório: os números do topo, o objetivo que ele
   viu, o atrito que contou e o que ele achou de errado. *"Link sozinho é relatório não
   entregue."*

#### Por que ele veio cego — 2 de setembro

O relatório voltou com **"0 messages across 0 sessions (1 total)"** e todas as seções
dizendo "No data". Não era o normal: em 1 de setembro às 15h48 ele contou 27 mensagens e
14 commits, e em 2 de setembro à 1h35 contou 16 mensagens (`docs/insights.md:1626-1660`).

**E o dado existia.** `usage-data/session-meta/` tinha o arquivo daquela sessão, gravado no
mesmo minuto do relatório: **68 minutos, 275 mensagens do assistente, 164 chamadas de Bash,
2 commits**. A coleta funcionou; o que não aconteceu foi a **análise** —
`usage-data/facets/` tinha **um** arquivo, de 1 de setembro às 12h53, e todo número do topo
do relatório é somado sobre as sessões analisadas.

**A causa provável, e ela é sobre como este projeto trabalha:** é **uma sessão só, longa e
retomada** — o id `3cd30dd5…` era o mesmo desde 1 de setembro e o transcrito já tinha 37 MB.
O relatório chaveia por id de sessão, e uma sessão que ele já analisou (ou grande demais
para reanalisar) é pulada. Some com ela e não sobra sessão nenhuma para somar.

Duas consequências práticas, transcritas:

- **Enquanto o trabalho continuar dentro desta sessão, `/insights` vai devolver nada** —
  *"não é uma sessão sem atrito, é uma sessão invisível"*. Para ter leitura de fora, o
  comando precisa ser rodado a partir de uma **sessão nova**.
- **Mesmo funcionando, ele nunca mediu código:** os relatórios de 1 e 2 de setembro, os
  com dado, dizem `+0/-0 Lines, 0 Files`. *"O que ele mede aqui é conversa, atrito e
  ferramenta, não trabalho entregue."*

A regra que ficou no `CLAUDE.md:206-214`: **zerado não é "está tudo bem": é instrumento
cego**, e a resposta certa é dizer isso em vez de fingir leitura. *"A regra do alerta
inventado vale para as ferramentas também: número que não mede nada ensina a ignorar o
painel."* (`docs/insights.md:1658-1660`).

#### O hook que tentava automatizar isso, e que nunca funcionou

`.claude/settings.json:83-91` registra um hook `SessionEnd`:

```
[ -n "$NORVA_INSIGHTS_CHILD" ] || NORVA_INSIGHTS_CHILD=1 claude -p '/insights' >> "$HOME/.claude/insights-auto.log" 2>&1 &
```

A variável `NORVA_INSIGHTS_CHILD` existe para evitar recursão (a sessão filha não dispara
outra). **Estado observado:** `~/.claude/insights-auto.log` tem 38 linhas e **nenhuma delas
é um relatório**. Todas são uma de duas mensagens:

- `Ignoring 40 permissions.allow entries from .claude/settings.json: this workspace has not
  been trusted.` — a sessão não-interativa não passa pelo diálogo de confiança, então as 40
  permissões de `.claude/settings.json:4-45` são descartadas.
- `Authentication error · This may be a temporary network issue, please try again`

Ou seja: **o `/insights` automático nunca produziu um relatório neste ambiente**. Isto não
está escrito em nenhum documento do repositório; é observação direta do log.

---

### 33.10 Ultracode é regra do projeto, não modo da sessão

Decisão do dono, 1 de setembro (`CLAUDE.md:224-241`). O texto:

> O ultracode cai sozinho: é estado de sessão, e sessão acaba. **Aqui ele vale sempre,
> esteja o botão ligado ou não.**

**Na prática, sem esperar o botão** (`CLAUDE.md:229-232`):

- tarefa substantiva **se orquestra com workflow ou subagentes** em vez de se resolver
  sozinho;
- **todo achado passa por verificação adversarial** antes de virar afirmação;
- **custo de token não é restrição**.

Fora disso ficam só conversa e edição mecânica trivial.

Os dois sentidos da regra: *"Se uma sessão indicar ultracode desligado, **esta regra
continua valendo** — ela é do projeto, não da sessão. E o inverso também: nada aqui
autoriza gastar rodada com workflow para trocar uma vírgula."* (`CLAUDE.md:234-236`).

**A nota honesta sobre o mecanismo**, transcrita porque ela documenta uma tentativa
falhada (`CLAUDE.md:238-241`):

> *Um gancho de início de sessão que injetasse esta regra sozinho foi tentado e recusado
> pelo classificador de permissão — escrever instrução para as próprias sessões futuras é
> coisa que ele guarda, com razão. Então o mecanismo é este arquivo, que é lido em toda
> sessão.*

Isto é coerente com `.claude/settings.json:129`, onde a skill `session-start-hook` está
`"off"`.

---

### 33.11 Nunca ocioso — regra imutável

Decisão do dono, 2 de setembro (`CLAUDE.md:245-281`). A frase-âncora:

> **Enquanto houver serviço a ser realizado, não se fica parado.** [...] não é conselho de
> produtividade: é o que separa uma sessão que trabalha de uma que fica olhando o próprio
> painel.

**A forma específica de ficar ocioso, que engana porque parece diligência**
(`CLAUDE.md:251-255`): *"o PR está verde, então re-checo o PR; nada mudou, então re-agendo
o check-in; e a rodada inteira passa confirmando que nada mudou. **Vigiar o que já está
pronto não é serviço** — é o intervalo entre serviços, e o intervalo se preenche com a
próxima coisa que precisa existir."*

**Onde a próxima coisa está escrita:** `docs/roadmap.md`. Esse arquivo existe porque a lista
já esteve espalhada entre as fases do `CLAUDE.md`, as dívidas do `docs/insights.md` e a
cabeça de quem trabalhava — *"e no dia em que o escopo fechou, a sessão ficou sem lista
tendo trabalho de sobra"* (`CLAUDE.md:257-264`, `docs/roadmap.md:5-16`). Regras do arquivo:

- **Item fechado sai do roadmap no mesmo commit que o fecha.**
- **Item novo entra com `arquivo:linha`** — *"sem isso é palpite, e palpite em plano tem a
  mesma cara de fato"* (`docs/roadmap.md:22-27`, citado em `src/bar.test.ts:15-19`).
- Se nada lá está de pé, o que sobra ainda é serviço: **procurar o insight** que a diretriz
  de §33.12 exige.

**Três coisas que não contam como ficar ocupado** (`CLAUDE.md:266-277`):

1. **Esperar não é trabalho, e trabalhar não é interromper.** Enquanto a barra roda ou o
   dono não respondeu, o certo é tocar o que **não depende** daquilo — não ficar consultando
   o estado do que está rodando.
2. **Inventar tarefa é pior que parar.** Vale a mesma regra do alerta inventado: a próxima
   coisa vem da lista escrita.
3. **O dono continua sabendo o que está acontecendo.** *"Não ficar ocioso não autoriza sumir
   por uma hora: o que foi feito e por quê se diz, curto, ao fim de cada rodada."*

**O único parar legítimo** é o que está na borda das perguntas (`CLAUDE.md:57-65`,
`CLAUDE.md:279-281`): decisão **irreversível**, decisão **de dono**, ou resposta que **muda
o que é construído**. Fora disso: *"pega a próxima e faz."*

**A metade desconfortável da regra, achada em uso.** Rodar `npm test` enquanto a bateria de
mutação roda a suíte 98 vezes numa máquina de quatro núcleos **não é trabalhar em paralelo:
é disputar a própria medida** — e foi isso que produziu o falso `MARCADOR ERRADO` de §33.2.1.
*"O que dá para fazer enquanto a barra roda é documento e leitura, e nada que peça CPU."*
(`docs/insights.md:3260-3266`).

---

### 33.12 Insight constante — diretriz obrigatória por rodada

`CLAUDE.md:285-310`. A pergunta que fecha toda rodada:

> **O que apareceu aqui que ninguém tinha visto?**

*"Insight neste projeto é achado que muda alguma coisa, e a prova de que mudou é o arquivo
que foi editado por causa dele."*

As três regras, transcritas (`CLAUDE.md:292-304`):

1. **Todo insight vira uma linha em `docs/insights.md`**, com o que se viu, por que importa
   e o que mudou por causa disso. *"Achado sem consequência não entra — se não mudou nada,
   ou não era achado, ou o trabalho não acabou."*
2. **Insight se procura, não se espera.** Antes de escrever código novo, a pergunta é o que
   o código existente está contradizendo: *"uma fundação que só vale no papel, uma função
   construída e nunca chamada, um número que só sobe, um teste que passa pelo motivo
   errado."* Foi assim que se descobriu que o aplicativo tinha o livro-razão no domínio e um
   `estoque_atual` no banco.
3. **"Não achei nada" é resposta válida e precisa ser dita.** *"Inventar um achado para
   parecer diligente é o mesmo defeito do alerta inventado: treina a ignorar."*

**Onde procurar quando não houver pista óbvia** (`CLAUDE.md:306-310`), cinco eixos:

| eixo | pergunta |
|---|---|
| fundação × esquema | o que a fundação promete contra o que o esquema faz |
| domínio × telas | o que o domínio exporta contra o que as telas chamam |
| aparelho × servidor | o que o aparelho grava contra o que o servidor aceitaria |
| teste × teste | o que um teste afirma contra o que ele exercita de verdade |
| Lei × tela | o que a Lei da Inteligência exige de cada tela contra o que ela responde hoje |

**A forma do arquivo.** `docs/insights.md` abre com: *"Registro de coisas que ninguém tinha
visto, e do que mudou por causa delas. [...] Cada linha existe porque um arquivo foi
editado."* (`docs/insights.md:1-8`). Cada entrada é `## <data> — <frase que nomeia o
achado>`, com os blocos em negrito **O que se viu / O que apareceu**, **Por que importa** e
**O que mudou**. Há também uma seção `## Em aberto` (`docs/insights.md:542-575`) para
*"achados desta rodada que ainda não viraram mudança. Ficam aqui até virarem."* No estado
documentado ela tinha 5 itens.

Uma entrada corrigida **não é apagada, é riscada com a correção ao lado** — a razão está
escrita no commit `9f20c77`: *"o achado fica registrado tachado em vez de apagado porque o
erro é o mais provável de se repetir"*.

**Três respostas honestas para "nada chama esta peça", e escrever teste não é uma delas.**
*"Quando nada chama uma peça, há três respostas honestas — trazer o chamador, apagar a peça,
ou registrar a fronteira com quem vai chamá-la. **Escrever teste não é uma delas.** Teste
sobre peça inalcançável não prova capacidade: prova que a peça faz o que ela faz, e passa a
proteger uma promessa que ninguém pode cobrar."* (`docs/insights.md:2628-2632`).

---

### 33.13 Antes de chamar algo de defeito, procure a decisão

Regra do `CLAUDE.md:352-370`, escrita depois de **três acusações de "violação de fundação"
num mesmo dia** que eram decisões registradas:

| acusação | a decisão que existia |
|---|---|
| `UnitStepper` sem chamador | é componente da Fase 2, e a tela de compra já dá a conversão por extenso |
| `[por quê?]` ausente na home | a conta abre em um toque, na receita |
| assistente guardando 39 frases só em português | o raciocínio inteiro está no topo de `src/assistant/index.ts`, **inclusive a condição de quando deixa de valer** |

*"O custo não é o tempo perdido, é pior: eu quase 'consertei' uma decisão que alguém tomou
por um motivo que eu não tinha lido."* No terceiro caso um workflow já tinha sido disparado
para preparar a correção, e o dono já tinha sido informado de que era defeito — *"a correção
teria deixado o assistente respondendo em espanhol sem entender espanhol, que é exatamente o
resultado pior que a decisão evitava"* (`docs/insights.md:1023-1044`).

**Onde procurar, nesta ordem:** `grep` no docblock do próprio arquivo · `docs/insights.md` ·
a lista de decisões do dono no `CLAUDE.md:314-348`. *"Se houver decisão escrita, o achado não
é defeito: ou é pedido de mudança para o dono, ou não é nada."* (`CLAUDE.md:360-362`).

**Contradição achada é suspeita de leitura errada até virar prova** (`CLAUDE.md:364-370`):
*"Quando o esquema parece contrariar uma fundação, a primeira hipótese é que eu li errado —
não que a fundação esteja furada. [...] Construir sobre uma premissa inventada custa a
rodada inteira, e o pior é que o código fica bonito: testes verdes protegendo uma regra que
ninguém pediu."*

O caso concreto disso, registrado no commit `9f20c77`: uma afirmação de que `'purchase'` não
existe no enum `movement_kind` do servidor — verdadeira para `0001_foundation.sql`, que foi
lido, e falsa porque o valor entra em `0007_movement_kind_purchase.sql:16`, que não foi.
**Migração append-only faz o estado do esquema ser a soma dos 32 arquivos, e ler o primeiro
produz uma contradição convincente.**

**E a regra irmã, que é sobre quem decidiu:** *"decisão de dono escrita por mim é a pior
linha de comentário que existe neste repositório. Quando eu escolher um lado de um
'depende', o comentário tem que dizer **quem escolheu e que a outra opção não foi
construída** — nunca 'como o sistema manda'. Se a frase que eu ia escrever atribui a escolha
a uma força externa, ela é o sinal de que eu decidi sozinho."* (`docs/insights.md:2818-2824`).
O caso: um comentário na tela de Ajustes dizia *"Claro e escuro continuam seguindo o
aparelho, **como o sistema manda**"* — não era o sistema mandando, era uma escolha vestida de
regra externa, e *"o comentário não descrevia o código — ele defendia o código de ser
questionado"* (`docs/insights.md:2825-2870`).

---

### 33.14 Git

A seção inteira do `CLAUDE.md:442-449`, transcrita:

> Desenvolvimento na **branch designada da sessão**; `main` só por **merge de PR**, que é
> **ato do dono**. Migração é append-only: `supabase/migrations/` e o `MIGRATIONS` de
> `src/data/db.ts` só crescem — **editar um passo que já rodou faz o banco e o arquivo
> divergirem em silêncio**.
>
> Commit explica *por que*, não *o que* — o diff já diz o quê.

**Estado observado do repositório:**

| | |
|---|---|
| remote | `https://github.com/ChrnX0/SZG-app` |
| branch de trabalho | `claude/recipes-production-app-vbwrde` |
| branch protegida | `main` (só por merge de PR) |
| migrações do servidor | 32 arquivos em `supabase/migrations/` |
| migrações do aparelho | até `const V17` em `src/data/db.ts` |

**A imposição mecânica da regra append-only** é o guard `97-migration-edited.sh`: acrescentar
arquivo é normal e não é sinalizado; **modificar ou apagar um que já existia na base é**
(`.proofgate/guards.d/97-migration-edited.sh:10-11`, `:29-37`). A razão escrita nele:

> *"Um passo que já rodou em algum lugar deixa aquele banco na forma que o texto ANTIGO
> produziu. Editar o arquivo muda o que um banco NOVO recebe e mais nada — então os dois
> divergem, em silêncio, e todo checkout está bem. Aparece meses depois como uma coluna que
> existe numa máquina e não em outra."* (`.proofgate/guards.d/97-migration-edited.sh:4-8`)

#### O formato da mensagem de commit

Regra: **assunto em português, no infinitivo ou como frase declarativa curta, dizendo o
porquê** — o diff já diz o quê (`CLAUDE.md:449`). Exemplos reais do histórico:

```
Matar o mutante que a asserção certa deixava vivo por causa do relógio
Varrer a família da fila travada, em vez de consertar a quinta aparição
O portão de mutação estava verde por construção, e nada podia notar
Documentar a forma de conferir não é conferir
Eu entreguei a capa sem nunca ter olhado para ela
```

O corpo, quando existe, é prosa em português que conta **o defeito, a causa e a prova nos
dois sentidos**. Exemplo integral, do commit `be9ac0a`:

```
Matar o mutante que a asserção certa deixava vivo por causa do relógio

O CI pegou um defeito atravessando a suíte: tirar o `NAO_ESTORNADO` de
`productionOn` deixa a corrida estornada contando como produzida — o almoxarifado
fica certo pela soma e a capa continua dizendo que a fábrica fez 500 picolés que
foram desfeitos.

A asserção que cobre isso já existia. O que não funcionava era a janela: ela era
montada com `localDate(nowIso(),'America/Sao_Paulo')` e o sufixo `T00:00:00.000Z`
— a data local de São Paulo carimbada com o fuso de Greenwich. `occurred_at` da
corrida é UTC. Entre 00h e 03h UTC os dois discordam de um dia, a janela não
contém o movimento, a consulta volta vazia, e `?? 0 === 0` passa com o filtro e
sem ele. O CI rodou à 1h04 UTC.

Agora a janela vem de `dayWindow`, que pergunta ao `Intl` que dia local é aquele
instante e devolve as bordas como instantes UTC, meio-aberto como a consulta
espera. Provado nas duas direções: com a mutação aplicada à mão o teste falha
com a mensagem certa, sem ela passam 74/74.

A lição é maior que o conserto: um teste que monta a própria janela de tempo com
concatenação de string passa pelo motivo errado em algum horário do dia, e a
suíte inteira fica verde às três da tarde e cega à uma da manhã.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QRWS8WVaFDhCCvCQsFAE5q
```

O rodapé de atribuição usado em **todos** os commits recentes é exatamente estas duas
linhas:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
```

---

### 33.15 `.claude/settings.json` — a configuração da sessão

| chave | valor | linha |
|---|---|---|
| `permissions.defaultMode` | `bypassPermissions` | `.claude/settings.json:3` |
| `permissions.allow` | 40 entradas — todas as ferramentas locais (`Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Task`, `Todo*`, `Task*`, `Skill`, `SendUserFile`, `PushNotification`, `SendMessage`, `Monitor`, `ScheduleWakeup`, `Cron*`, `*Mcp*`, `ListConnectors`) mais os MCP `github`, `Vercel`, `Expo`, `Supabase`, `Claude_Code_Remote`, `Figma` | `:4-45` |
| `permissions.deny` | 33 servidores MCP bloqueados por prefixo (`mcp__Gmail`, `mcp__Slack`, `mcp__Notion`, `mcp__PayPal`, `mcp__Zapier`, `mcp__GitHub` maiúsculo, …) | `:46-80` |
| `hooks.SessionEnd` | dispara `claude -p '/insights'` em segundo plano, com guarda de recursão | `:83-91` |
| `hooks.PreToolUse` | `matcher: "Bash"` → `bash .proofgate/hooks/push-guard.sh` | `:93-103` |
| `skillOverrides` | **28 skills desligadas** (`docx`, `pptx`, `xlsx`, `pdf`, `canvas-design`, `algorithmic-art`, `slack-gif-creator`, `theme-factory`, `brand-guidelines`, `web-artifacts-builder`, `internal-comms`, `doc-coauthoring`, `learn`, `mcp-builder`, `skill-creator`, `import-memory`, `artifact-design`, `artifact-diagramming`, `artifact-capabilities`, `dataviz`, `design`, `claude-api`, `init`, `keybindings-help`, `fewer-permission-prompts`, `session-start-hook`) | `:105-132` |
| `deniedMcpServers` | 46 entradas nomeadas, incluindo as duas grafias de cada (`Booking.com` e `Booking_com`) | `:133-…` |

Duas observações que só o arquivo revela:

- `mcp__GoDaddy` aparece **ao mesmo tempo** em `allow` (`:44`) e em `deny` (`:59`), e
  `GitHub` (maiúsculo) está em `deny` enquanto `github` (minúsculo) está em `allow` — a
  intenção aparente é bloquear o servidor MCP oficial e usar só o `github` minúsculo.
- `session-start-hook: off` é a contraparte da nota honesta sobre ultracode (§33.10): o
  mecanismo de injeção automática foi desligado e substituído pelo `CLAUDE.md`.

---

### 33.16 Armadilhas de ambiente já pagas com tempo

A tabela-resumo, com as fontes. As sete primeiras estão em
`docs/dossie/34-recomecar.md:189-197`; cada uma tem detalhe abaixo.

| # | armadilha | sintoma | causa | regra que ficou |
|---|---|---|---|---|
| 1 | `pkill` largo | a verificação recém-disparada morre; a saída parece crash | o padrão casa com a **própria linha de comando** do shell | parar só pelo **PID que você anotou** |
| 2 | `import()` como checagem de sintaxe | processo órfão rodando 8 h, roubando CPU | `import()` **executa** o módulo | `node --check arquivo.mjs` valida e não executa |
| 3 | reuso de `dist` no e2e | suíte verde para uma tela sem a mudança | o export era pulado quando `dist` existia | o pacote é sempre o **da execução** |
| 4 | cache do Metro com manifesto velho | Ajustes mostra `0.2.0` com `app.json` em `0.7.0` | a chave do cache é o conteúdo do módulo, que não muda quando o `app.json` muda | `--clear` quando o hash do `app.json` mudar |
| 5 | Prettier sem configuração | arquivo inteiro reformatado com aspas duplas | formatador sem config aplica os padrões dele | **nunca** rodar formatador sem config no projeto |
| 6 | `expo prebuild` | scripts do `package.json` reescritos sem aviso | comando de scaffold regenera arquivos | conferir o **diff do `package.json`** depois de qualquer scaffold |
| 7 | emulador Android | `emulator -accel-check` diz `KVM requires a CPU that supports vmx or svm` | a máquina não tem virtualização | **decidir o caminho de verificação visual antes de prometer verificação visual** |
| 8 | portão lido na árvore de trabalho | marcador de justificativa "não existe" para o portão | o portão lê `base..HEAD` | **commit primeiro**, conferir depois |
| 9 | `**` sem aspas no glob | um arquivo de teste inteiro nunca rodava | o shell expande antes do runner e `**` vira um nível | glob **entre aspas**, expandido pelo node |
| 10 | `actions/cache@` com `timeout-minutes` | o cache que faria a compilação caber só existiria se ela já tivesse cabido | job morto por timeout não roda o *post* que grava | `cache/restore` e `cache/save` separados, save em `if: always()` |
| 11 | `if: always()` com máquina morta | o passo de cache aparece `skipped` | `always()` cobre passo que falha e job cancelado, **não a máquina sumir** | não estourar a memória da máquina |
| 12 | `actions/cache/save` sem espaço em disco | `##[warning]` e job **verde** com cache inexistente | o passo não falha quando não consegue gravar | em CI, **verde é convite para ler o log** |
| 13 | número da máquina lido de comentário | `-Xmx6g` pedindo 76% da RAM de um runner de 7 938 MB | o comentário dizia "16 GB" e estava errado desde antes | quando a correção é um número que descreve a máquina, **a máquina responde** (`free -m`, `nproc`) |
| 14 | `echo >>` em arquivo sem quebra de linha final | duas propriedades coladas numa linha, sem erro | o `gradle.properties` do prebuild termina sem `\n` | **rodar o passo de shell antes de subir**, com `bash -eo pipefail` |
| 15 | verificar por dentro e afirmar sobre fora | link do release: 200 no `curl`, **404** para o dono | o proxy do ambiente **injeta credencial** | provar pelo caminho que o outro vai usar |
| 16 | teste que passa por falta de rede | verde local, vermelho no runner | o cartão do tempo só existe quando há internet | nunca afirmar **ausência** do que o ambiente pode acrescentar |
| 17 | ferramenta de olhar cega | foto do escuro idêntica à do claro | a preferência saiu do aparelho e virou do aplicativo | toda ferramenta que dirige o app de fora fica cega no mesmo instante |
| 18 | disputa de CPU auto-infligida | `NÃO MEDIDO` / falso `MARCADOR ERRADO` | rodar a suíte enquanto a bateria roda a suíte 98 vezes | enquanto a barra roda, só documento e leitura |

#### 1. `pkill` largo mata a própria verificação — **duas aparições**

**Sintoma, 1ª vez.** Um `pkill` largo matou a verificação que tinha acabado de ser
disparada — *"inclusive a nova, junto com a velha"* (`CLAUDE.md:154-156`). A saída que voltou
parecia um crash, e *"os vinte minutos seguintes foram depurar um fantasma"*
(`.proofgate/guards.d/45-broad-process-kill.sh:5-9`).

**Sintoma, 2ª vez (4 de setembro), com a regra já escrita.** O comando foi
`pkill -f "serve -s dist -l 4179"` para derrubar um servidor de teste. **O padrão casou com o
próprio comando do shell**, que continha aquela string. O shell morreu no meio e o `node` que
vinha depois — a reescrita de uma checagem do e2e — **nunca rodou**. *"Eu só descobri porque
conferi o arquivo depois e ele estava intacto: o comando 'terminou' com um código de saída
estranho e nenhuma mensagem."* (`docs/insights.md:3392-3408`).

**Causa.** A linha de comando do próprio shell é um processo com aquele texto dentro, então
**todo padrão amplo se inclui**. E, em geral: qualquer coisa que seleciona vítimas por padrão
não sabe distinguir o seu processo do de outra pessoa — *"incluindo o seu próprio, futuro"*
(`.proofgate/guards.d/45-broad-process-kill.sh:10-12`).

**Regra.** *"Nunca mate processo por padrão. Se precisar parar algo, pare pelo PID que você
mesmo anotou."* (`CLAUDE.md:154-156`). Se for inevitável parar por padrão, o padrão tem de
excluir o próprio PID: `pgrep -f … | grep -v $$` (`docs/insights.md:3404-3408`). Virou guard:
`45-broad-process-kill.sh` pega `pkill`, `killall`, `kill -N $(pgrep`, `kill $(pgrep` e
`taskkill /IM` em linhas adicionadas, com saída 2 (aviso).

#### 2. `import()` não é checagem de sintaxe — o processo de oito horas

**Sintoma.** Investigando por que a auditoria estava lenta, uma listagem de processos revelou
restos próprios com **oito e nove horas de idade**: um `node -e "import('./scripts/mutate.mjs')"`
**órfão** (`ppid 1`), o trabalhador de mutação que ele abriu, o trabalhador de uma execução
anterior, e um laço `until grep` de espera (`docs/insights.md:3021-3031`).

**Causa.** O comando foi escrito **como checagem de sintaxe** depois de editar o `mutate.mjs`
com um script. `import()` de um módulo com efeito de topo **executa o módulo** — então a
"checagem de sintaxe" disparou a suíte de mutação inteira. E o `&` no fim do comando o
órfãou: `ppid 1`, fora de qualquer árvore de processo que alguém fosse olhar depois
(`CLAUDE.md:157-164`, `docs/insights.md:3033-3037`).

**O custo, medido.** Quatro núcleos na máquina. O limite de concorrência de um workflow é
`min(16, núcleos − 2)` = **2**, e esses restos disputavam os mesmos núcleos. A auditoria de
dez frentes levou **duas horas** só para a primeira fase; o `e2e` saiu `17/17 com 2 fatias
vermelhas` numa execução, diagnosticado como disputa com o `mutate` — *"verdade parcial, e não
a causa. A causa estava rodando desde a manhã."* (`docs/insights.md:3039-3046`).

**A prova, nos dois sentidos** (`docs/insights.md:3048-3055`):

```
$ node -e "import('./efeito.mjs')"
EU RODEI — e isto devia ser só uma checagem de sintaxe

$ node --check efeito.mjs
(silêncio — sintaxe boa, e nada rodou)
```

**Regras que ficaram** (duas, e a segunda é a menos óbvia):

- **Sintaxe se confere com `node --check arquivo.mjs`**, que valida e não executa
  (`CLAUDE.md:164`).
- ***A maneira de verificar uma coisa não pode ser fazer a coisa.*** É a mesma forma da
  oficina do `mutate` que declarava "pego" sem consultar a suíte, da tabela que se conferia
  contra a própria memória, e da guarda que comparava uma lista com ela mesma — *"aqui a
  verificação **era** a execução, então ela não podia falhar em dizer 'está bom': ela
  simplesmente ia"* (`docs/insights.md:3059-3064`).
- ***O que roda em segundo plano tem que ficar numa árvore que eu consiga olhar.*** `&` num
  comando de sessão entrega o processo ao init (`docs/insights.md:3066-3067`).

**Estado observado:** `.mutate/w0`, `w1`, `w2` e `w3` estão no disco sem nenhum processo
`node` rodando — evidência de uma execução que morreu sem o `process.on('exit')` limpar
(`scripts/mutate.mjs:1162`). Como `.mutate/` está no `.gitignore`, isso **não** suja a árvore
nem reprova o portão — e essa isenção está escrita no próprio `.gitignore`: *"Ele apaga
sozinho ao sair; isto cobre a execução que morreu no meio, para o portão não reprovar por
'árvore suja' por causa de lixo de ferramenta."*

#### 3. Reuso de `dist` no e2e — a suíte verde para uma tela sem a mudança

**Sintoma.** `e2e/flow.mjs` só exportava a versão web se `dist` **não existisse**. Com a pasta
em cache, uma tela nova nunca entrava no pacote — e a suíte passou **8/8 contra um build que
não continha a mudança** (`docs/insights.md:97-110`).

**Por que é o pior tipo de defeito**, transcrito: *"Um teste que falha avisa. Um teste que
passa pelo motivo errado é indistinguível de sucesso."*

**Causa.** O atalho existia para um caso legítimo — iterar nas próprias checagens — e foi
aplicado por padrão.

**Regra.** Exporta **sempre**, a não ser que alguém peça reúso em voz alta com
`E2E_REUSE_BUILD` (`e2e/flow.mjs:1931-1938`). No `e2e:fast` o export acontece **uma vez, ali,
imediatamente antes das fatias**, e as fatias reusam esse `dist` — *"aqui o pacote é sempre o
desta execução; o que se evita é empacotar quatro vezes o mesmo código"*
(`scripts/e2e-parallel.mjs:11-18`).

**A variante refinada, em `scripts/manifesto.mjs`:** *"'porque existia' e 'porque é o mesmo
código' são coisas diferentes, e a diferença é uma soma de verificação."* `fonteDoPacote()`
soma `app/`, `src/`, `assets/`, `app.json`, `package.json`, `babel.config.js` e
`metro.config.js`; `pacoteServe()` compara com a marca em `.expo/fonte.sha`; `marcarPacote()`
grava **depois** do sucesso, nunca antes (`scripts/manifesto.mjs:50-101`). O `shot` usa isso;
o `e2e` não.

#### 4. O pacote fresco com o manifesto de cinco versões atrás

**Sintoma.** A tela de Ajustes escreve a versão no cabeçalho. Numa revisão de rotina ela dizia
**`0.2.0`** — cinco versões atrás do `app.json`, que dizia `0.7.0`. `npx expo config` resolvia
`0.7.0` corretamente: quem estava velho era **o pacote**, exportado dois minutos antes
(`docs/insights.md:2396-2404`, `scripts/manifesto.mjs:7-18`).

**Causa.** O manifesto inteiro é embutido no `expo-constants` **na hora de transformar o
módulo**, e a chave do cache do Metro é o conteúdo *daquele módulo* — que **não muda quando o
`app.json` muda**. Então a exportação sai fresca com o manifesto velho, e continua assim para
sempre.

**Por que é pior do que parece.** O campo visível é só a versão, mas o que está congelado é o
**manifesto inteiro**: ícone, esquema, plugins, permissões. E as duas ferramentas de olhar
deste repositório — `npm run shot` e o `e2e` — leem exatamente esse pacote. *"Toda foto que
mandei nesta sessão e toda execução da suíte leram um manifesto de cinco versões atrás."*
(`docs/insights.md:2406-2412`).

**A crença que escondeu o defeito.** O comentário no `e2e` dizia, com todas as letras: *"No
`--clear`: that empties the bundler cache, which buys nothing here"* — escrito quando a espera
do portão estava sendo medida e encolhida, verdadeiro para o caso que ele tinha na mão
(`expo export` reescreve `dist` de qualquer jeito), **falso para o manifesto**. *"O comentário
fez a pergunta parar de ser feita."* (`docs/insights.md:2414-2420`).

**Regra e mecanismo.** `scripts/manifesto.mjs` guarda o **sha256 do `app.json`** em
`.expo/manifesto.sha` ao lado da marca da última exportação; `precisaLimpar()` compara, e
`shot` e `e2e` passam `--clear` **só quando ele mudou** (`scripts/manifesto.mjs:29-47`). A
marca é gravada **depois** do sucesso: *"um export que morreu no meio não provou nada sobre o
manifesto que está em `dist`"* (`scripts/e2e-parallel.mjs:47-49`). E o `e2e` passou a afirmar,
na tela de Ajustes, que a versão exibida é a do `app.json`.

**A regra generalizada, transcrita:** *"**Cache invisível é cache que mente.** Quando um dado
nasce *fora* dos arquivos que o cache tem como chave — um manifesto, uma variável de ambiente,
um relógio —, alguma coisa no produto final tem que dizer esse dado em voz alta, para uma
asserção poder compará-lo com a fonte."* (`docs/insights.md:2430-2434`).

**Nota de escopo, e ela é a lição secundária:** a mesma regra estava escrita em
`e2e/flow.mjs` e **não valia em `scripts/e2e-parallel.mjs`**, que é o caminho que o portão usa
de verdade. *"Regra que vale num caminho e não no outro é regra que não vale."*
(`scripts/e2e-parallel.mjs:33-38`).

#### 5. Prettier sem configuração reformatou o arquivo inteiro

**Sintoma.** `npx prettier --write` reformatou o arquivo inteiro com aspas duplas
(`docs/dossie/34-recomecar.md:191`).

**Causa.** Sem arquivo de configuração no projeto, o formatador aplica os padrões dele — que
não são os do projeto — e o diff resultante mistura a mudança real com centenas de linhas de
reformatação.

**Regra.** *"Nunca rodar formatador sem config no projeto."*

**Estado do repositório, dito porque importa para reconstruir:** **não existe** `.prettierrc`,
`.prettierrc.json`, `prettier.config.js` nem chave `prettier` no `package.json`, e `prettier`
**não está** entre as dependências (`package.json:21-48`). O único formatador/linter
configurado é o ESLint via `eslint.config.js`, que estende `eslint-config-expo/flat` e ignora
`dist/*`. Ou seja: a armadilha é real e a defesa contra ela é **não rodar prettier**, não uma
configuração.

**Evidência:** esta armadilha aparece **apenas** em `docs/dossie/34-recomecar.md:191`. **NÃO
ESTÁ** em `docs/insights.md` nem em nenhum comentário de código — não há entrada datada com o
episódio, nem guard da proofgate para ela.

#### 6. `expo prebuild` reescreveu os scripts do `package.json`

**Sintoma.** `expo prebuild` reescreveu os scripts do `package.json` **sem avisar**
(`docs/dossie/34-recomecar.md:192`).

**Causa.** Comandos de scaffold do Expo regeneram arquivos de projeto a partir dos templates
deles.

**Regra.** *"Conferir o diff do `package.json` depois de qualquer comando de scaffold."*

**O que o repositório mostra sobre `prebuild`.** Ele é rodado **no CI**, não localmente:
`npx expo prebuild --platform android --no-install` (`.github/workflows/build-apk.yml:101`).
As pastas nativas `/ios` e `/android` estão no `.gitignore` sob o rótulo *"generated native
folders"*, ou seja **regeneradas a cada execução** e nunca versionadas. Consequências
documentadas em outros lugares:

- `android/gradle.properties` é gerado a cada execução com `-Xmx2048m
  -XX:MaxMetaspaceSize=512m`, e **como `android/` é ignorado pelo git, isso não aparece em
  nenhum diff** — *"se regenera do zero a cada execução, sempre igual, sempre pequeno"*
  (`docs/insights.md:1327-1334`).
- `expo prebuild` regenera o `build.gradle` com `versionCode 1` toda vez
  (`.github/workflows/build-apk.yml:168`).
- O `gradle.properties` gerado **termina sem quebra de linha**
  (`.github/workflows/build-apk.yml:148`, `docs/insights.md:1386-1394`).

**Evidência:** a reescrita específica dos **scripts do `package.json`** aparece **apenas** em
`docs/dossie/34-recomecar.md:192`. **NÃO ESTÁ** em `docs/insights.md`. O histórico do
`package.json` (12 commits) mostra os scripts sendo **acrescentados** e a correção das aspas
do glob, e **nenhum commit** que restaure scripts apagados — então o episódio, se aconteceu,
foi corrigido antes de virar commit ou não deixou rastro no histórico.

#### 7. Emulador Android impossível sem KVM

**Sintoma.** Não havia como abrir o aplicativo num Android. `emulator -accel-check` responde
`KVM requires a CPU that supports vmx or svm` (`docs/dossie/34-recomecar.md:15`,
`docs/dossie/34-recomecar.md:193`).

**Causa.** A máquina onde as sessões rodavam **não tem virtualização**. Sem KVM não há
emulador; e o APK compilado só podia ser verificado **no nível de artefato** — assinatura,
manifesto, tamanho, presença do bundle JS.

**Consequência medida, e ela é a maior deste repositório.** *"A única visão real da interface
era a versão web dirigida por Playwright."* Toda a lista de defeitos visuais que chegou ao
dono — o cartão do clima virando um hematoma verde-oliva, o ícone de picolé num produto que
não é sorvete, os rótulos de aba truncados ("Transpo…", "Relatóri…"), e a hierarquia das três
tintas colapsada nos dois temas claros — *"é consequência disso, não de descuido pontual.
**Quem não vê a tela, conserta a tela por dedução, e dedução erra.**"*
(`docs/dossie/34-recomecar.md:13-24`).

**Regra.** *"Decidir o caminho de verificação visual **antes** de prometer verificação
visual."* E o registro honesto do que isso custou: *"Ordem do dono cumprida pela metade: o APK
foi compilado e verificado como artefato, e nunca foi aberto. Isso deveria ter sido dito como
**bloqueio no primeiro minuto**, não descoberto no fim."*
(`docs/dossie/34-recomecar.md:243-245`).

**Armadilha irmã, do lado da instalação:** o APK local é assinado com chave de debug e o da
Expo com a chave do EAS. **Assinaturas diferentes fazem o Android recusar instalar um por cima
do outro** — é preciso desinstalar antes, e isso apaga os dados locais
(`docs/insights.md:1072-1075`).

#### 8. O portão lê `base..HEAD`, não a árvore de trabalho

**Sintoma.** Um marcador `proofgate-allow` escrito num arquivo ainda não commitado
simplesmente **não existe** para o portão; o aviso continua contando.

**Causa.** `.proofgate/verify.sh` roda seus guards sobre `git diff "$BASE"..HEAD`
(`.proofgate/guards.d/97-migration-edited.sh:29`, `.proofgate/guards.d/99-dead-allow.sh:27-30`).

**Regra.** *"Commit primeiro, depois confira."* (`CLAUDE.md:165-167`).

**Armadilha adjacente, do mesmo mecanismo:** o aviso `sourceless-diff`. Se o diff guardado não
tem **nenhum** arquivo de código (só docs/config), os ✅ dos guards de diff querem dizer *"não
havia o que olhar"*, não *"nada errado"* — e o portão diz isso em voz alta, pedindo
`--base <sha antes do bloco>` (`.proofgate/verify.sh:280`).

#### 9. `**` sem aspas — o arquivo de teste que nunca rodava

Descrito em §33.1. Sintoma: escrever `src/layers.test.ts`, rodar a suíte, e o total **não se
mover** (131 antes, 131 depois). Causa: `tsx --test src/**/*.test.ts` sem aspas, com o shell
expandindo `**` como um nível só. *"Teste que não roda é indistinguível de teste que passa.
[...] Foi só porque eu contei que apareceu — e contar não é hábito, é sorte."*
(`docs/insights.md:799-813`). Regra: glob entre aspas, expandido pelo node; e virou o guard
`47-unquoted-globstar`.

#### 10–14. As armadilhas de CI, na ordem em que apareceram

**10. O cache que só existiria se a compilação já tivesse cabido.** Duas execuções do APK
morreram dizendo `cancelled` — a palavra que o GitHub usa quando `timeout-minutes` mata o job,
*"e que não distingue 'travou' de 'demorou'"*. Lendo o log até o fim: aos 26 minutos começa
`java.lang.OutOfMemoryError: Metaspace`, repetido por treze minutos, e depois **vinte minutos
sem uma linha nova** até o relógio matar. O passo de cache era o `actions/cache@v4` inteiro,
que **só grava no *post* de um job que terminou** — job morto por timeout não grava. *"O cache
que faria a compilação caber só existiria se ela já tivesse cabido. Duas horas de runner
queimadas provando isso."* Conserto: `cache/restore` e `cache/save` **separados**, save em
`if: always()`, chave carregando o `run_id`, *"para que cada tentativa deixe para a próxima o
que já compilou"* (`docs/insights.md:1320-1361`).

> *"Um limite de tempo é teto, nunca explicação — e falha de memória usando o relógio como
> disfarce é a mais cara que existe, porque cada tentativa custa uma hora antes de dizer
> nada."*

**11. `if: always()` não cobre a máquina sumir.** Numa execução seguinte o log disse `The
runner has received a shutdown signal` depois de nove minutos sem uma linha. O passo de gravar
cache apareceu como **`skipped`**, junto com todos os post-steps: *"nada roda num runner que
morreu"*. `always()` cobre passo que falha e job cancelado — não isso
(`docs/insights.md:1391-1397`).

**12. O passo de cache que sai verde falhando.** O log diz `zstd: error 70 : Write error :
cannot write block : No space left on device`. **`actions/cache/save` não falha quando não
consegue gravar**: emite `##[warning]` e sai verde. O job inteiro aparece bem-sucedido, o
passo do cache aparece bem-sucedido, e o cache não existe. *"Se eu tivesse olhado só a
bolinha verde teria dito ao dono que a próxima compilação seria rápida — pela terceira vez a
mesma promessa, e pela terceira vez falsa."* É a Lei da Inteligência do lado de dentro: **erro
se impede, não se reclama** — *"e um passo que 'reclama e passa' é pior que um que falha,
porque ensina a confiar na cor"*. Regra: **em CI, verde é convite para ler o log, não
substituto** (`docs/insights.md:1420-1432`).

**O padrão das três execuções, transcrito:** *"Toda vez a causa real estava a uma linha de
distância no log, e toda vez o resumo do GitHub dizia outra coisa: `cancelled` para falta de
Metaspace, `failure` para a máquina morrendo, `success` para um cache que não gravou. **O que
o painel mostra é o desfecho, e desfecho não é causa.**"* (`docs/insights.md:1428-1432`).

**13. O número da máquina lido de um comentário.** `-Xmx6g` foi escrito porque um comentário
dizia *"o runner tem 16 GB"* — e isso nunca foi conferido. O passo que mede imprimiu
`nproc` = **2** e `Mem: 7.8Gi`: o `-Xmx6g` pedia **76% da RAM da máquina inteira** para uma
JVM só, com o Kotlin, o R8 e o aapt2 ainda por vir. *"Runner de repositório privado é 2
núcleos e 7,75 GB. Medir custou uma linha de shell; acreditar custou uma execução de 35
minutos e um runner morto."* Conserto: o passo **lê a RAM** (`free -m`), tira metade com piso
e teto, imprime `nproc` e `free -h` no log, e limita também a JVM do Kotlin
(`docs/insights.md:1401-1418`, `docs/insights.md:1374-1384`).

> **A regra, e vale além de CI:** *"quando a correção é um número que descreve a máquina —
> memória, paralelismo, timeout — o certo é a máquina responder, não eu."*
> (`docs/insights.md:1396-1399`)

**14. `echo >>` num arquivo que termina sem quebra de linha.** Ia-se acrescentar
`kotlin.daemon.jvmargs` com `echo >>`, e o `gradle.properties` que o prebuild gera **termina
sem `\n`**: o resultado seria
`expo.inlineModules.watchedDirectories=[]kotlin.daemon.jvmargs=-Xmx1g` — *"uma linha que
estraga as duas propriedades e não reclama de nada"*. Foi pego porque o passo foi **rodado de
verdade** contra o arquivo real, com `bash -eo pipefail` como o GitHub roda. *"Ler o YAML não
teria mostrado nunca."* Regra: **quando o passo é shell, ele se roda antes de subir** — *"três
defeitos nesta sessão vieram de texto que parecia certo lido"* (`docs/insights.md:1386-1399`).

**E o cache quente, medido em vez de prometido.** A promessa *"a segunda execução passa a
levar minutos"* foi repetida três vezes sem que nenhuma segunda execução existisse. Quando
finalmente aconteceu: `Cache restored from key: gradle-Linux-27906c7d…-33576896419`,
1 767 734 217 B (1,65 GiB). O passo "Compilar, só arm64" levou **16 min 53 s** contra
**24 min 13 s** da execução fria — 440 segundos, **30%** —, e o job inteiro caiu de 25m52s para
18m59s. **E a linha que desmente a leitura fácil:** as duas execuções terminaram com
`871 actionable tasks: 871 executed`, **zero `FROM-CACHE`** e as mesmas 39 `UP-TO-DATE`. *"O
que `~/.gradle/caches` guarda é artefato baixado e transformado, não saída de tarefa — cache
de dependência não é cache de compilação."* A prova não é o tempo total nem a cor do job: **é a
linha de contagem de tarefas** (`docs/insights.md:1434-1469`).

#### 15. Verificar por dentro e afirmar sobre fora

Descrito em §33.6. O `curl` respondia 200 porque **o proxy do ambiente injeta credencial**;
o dono, anônimo, recebeu 404. *"É exatamente o superusuário que ignora a política, com outra
roupa."* (`docs/insights.md:1046-1058`). Guard irmão:
`.proofgate/guards.d/92-superuser-verification.sh`.

O conserto do mesmo dia mediu outra coisa útil: o APK carregava **quatro arquiteturas** —
23,8 MB de `x86` e 23,2 de `x86_64`, que só existem em emulador; **47 dos 110 MB eram peso
morto**. Compilando só `arm64-v8a`: **47 MB em 3 min 29 s**, contra 110 MB e vinte minutos
(`docs/insights.md:1060-1065`, `.github/workflows/build-apk.yml:7`).

#### 16. O teste que passou aqui e reprovou no CI, e a diferença era a internet

Descrito em §33.2.2. *"Uma afirmação larga é a que primeiro mente quando o ambiente muda, e
ela mente para o lado pior — verde onde deveria reprovar, ou vermelho onde não há defeito.
Neste caso as duas coisas ao mesmo tempo, em máquinas diferentes."*
(`docs/insights.md:2114-2120`).

#### 17. A ferramenta de olhar cega de três jeitos

Descrito em §33.7 (`docs/insights.md:3473-3499`).

#### 18. Disputar a própria medida

Descrito em §33.2.1 e §33.11 (`docs/insights.md:3260-3266`).

---

### 33.17 O portão por item (P1 · P2 · P3)

Não é fase, é por item; três perguntas nesta ordem, e **a primeira que reprovar decide**
(`CLAUDE.md:411-430`):

**P1 — Quem chama isto no mesmo commit?** Sem chamador, não entra. Fim. *"É a doença provada
deste repositório: `assistant_phrase` com índice dedicado e nenhuma escrita, `Draft.kind` sem
leitor, `balanceAt` e `daysOfCover` chamados só por teste, quatro seções de dicionário nos três
idiomas sem uma tela. O número da fase não pegou nenhuma delas."*

**P2 — Complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item depende de
observar alguém. **Mas antes de travar, cheque a fundação do "depende":** se o que muda com a
observação é *preferência de quem usa*, não é pergunta nem espera — é configuração, e os dois
caminhos existem. *"Só trava o que nenhuma configuração resolve."*

**P3 — Entrando errado, conserta com um commit ou com migração e estorno?** Se toca
`supabase/migrations/`, o caminho de escrita de `movements`, ou a semântica de
`movement_kind`/`location_kind`, **é caro e permanente**. *"Forma de esquema se adivinha de
graça enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna."*

---

### 33.18 O que NÃO foi possível determinar

- **O texto e o comportamento do comando `/insights`.** Ele não está no repositório
  (`.claude/` contém **só** `settings.json`) nem em `~/.claude/commands/` (diretório
  inexistente). Tudo o que se sabe dele vem do `CLAUDE.md:185-220` e de
  `docs/insights.md:1626-1660`. **NÃO ESTÁ NO CÓDIGO.**
- **A definição dos níveis E1 e E2** da escala de evidência. Só E0, E3 e E4 são nomeados, e
  apenas com glosas de uma palavra (`CLAUDE.md:180`). **NÃO ESTÁ NO CÓDIGO.**
- **`proofgate.json`.** Não existe na raiz; toda referência a ele
  (`CLAUDE.md:174-175`, `.proofgate/verify.sh:22-24`, `.proofgate/hooks/push-guard.sh:16`) é
  ao arquivo **opcional** que este repositório nunca criou. **NÃO IMPLEMENTADO aqui.**
- **O repositório da proofgate (`ChrnX0/proofgate`)** — os guards estão *vendorizados* em
  `.proofgate/` e o `CLAUDE.md:372-376` diz que guards novos sobem por PR lá, mas o
  repositório de origem não faz parte deste checkout, então o processo de contribuição para
  ele não é verificável daqui.
- **O episódio datado do Prettier e o do `expo prebuild` reescrevendo scripts.** Existem
  apenas como linhas de tabela em `docs/dossie/34-recomecar.md:191-192`, **sem entrada
  correspondente em `docs/insights.md`** e sem rastro no histórico do `package.json`. As
  regras estão registradas; as datas, os comandos exatos e o diff resultante **não**.
- **Se as 24 guardas afirmadas em `docs/roadmap.md:48` já foram 24.** Hoje há 25 arquivos em
  `.proofgate/guards.d/*.sh` e o comentário do CI diz 19 (`.github/workflows/ci.yml:67`).
  Nenhuma guarda confere esse número, então não dá para saber em que momento cada afirmação
  era verdadeira.
