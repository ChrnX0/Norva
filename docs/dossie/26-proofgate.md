## 26. Proofgate: o portão de entrega

### 26.1 O que é

O ProofGate é um portão **mecânico** de entrega: um script de shell que roda sobre
o *diff* de uma entrega e devolve um veredito legível por máquina. Ele se declara
como "a metade da lista de verificação que uma máquina confere melhor que o
julgamento" — a outra metade, o julgamento, é explicitamente delegada a um
documento fora do script (`.proofgate/verify.sh:2-3`).

As partes que compõem o portão dentro deste repositório:

| Parte | Caminho | Papel |
|---|---|---|
| Motor | `.proofgate/verify.sh` (332 linhas) | orquestra passos, roda os guards, escreve o veredito |
| Biblioteca | `.proofgate/lib.sh` (189 linhas) | leitura de config sem dependência dura + primitivas de diff |
| Guards | `.proofgate/guards.d/NN-nome.sh` (25 arquivos) | um defeito específico por arquivo |
| Gancho | `.proofgate/hooks/push-guard.sh` (78 linhas) | recusa `git push` sem veredito fresco |
| Modelos | `.proofgate/templates/evidence-report.md`, `.proofgate/templates/root-cause.md` | as duas folhas do portão de julgamento |
| Molde de guard | `.proofgate/guards.d/TEMPLATE.sh.example` (38 linhas) | contrato + esqueleto de um guard novo |

**Estado: implementado e chamado.** O portão é invocado em três lugares reais:

- na barra de verificação do projeto, como `bash .proofgate/verify.sh`
  (`CLAUDE.md`, seção "A barra de verificação"; `README.md:229`);
- no CI, como um *job* dedicado chamado `proofgate`
  (`.github/workflows/ci.yml:51-71`, passo "Delivery gate": `run: bash .proofgate/verify.sh`);
- no gancho `PreToolUse` do agente, que executa `bash .proofgate/hooks/push-guard.sh`
  em toda chamada de Bash (`.claude/settings.json`, bloco `hooks.PreToolUse`,
  `matcher: "Bash"`).

O motor é **vendorizado**: veio do repositório `ChrnX0/proofgate` e vive copiado
aqui (`docs/insights.md:806-814` — "virou guard na proofgate (`47-unquoted-globstar`)";
`git log -- .proofgate` traz títulos como "Trazer o dependency-change corrigido
para a cópia local" e "Alinhar os guards vendorizados com o que subiu para a
proofgate"). A cópia local pode estar atrás do motor de origem, e este capítulo
descreve **a cópia local**, não o upstream.

### 26.2 O que NÃO está aqui

O `verify.sh` termina o caminho feliz dizendo:

```
✅ Mechanical gate passed (N warning(s) — justify each in your status).
   Now the JUDGMENT gate (SKILL.md, step 2) — with evidence.
```

(`.proofgate/verify.sh:294-295`)

**O `SKILL.md` citado NÃO ESTÁ NO CÓDIGO deste repositório.** Uma busca por
`SKILL.md` em toda a árvore (fora de `node_modules`) não encontra arquivo algum.
A *skill* homônima instalada na máquina
(`/root/.claude/skills/synced/.../proofgate/SKILL.md`, 7 linhas) contém apenas
duas linhas de comando — o `curl` do instalador e `bash .proofgate/verify.sh` — e
nenhum passo 2, nenhum critério de julgamento. Portanto: **o portão de julgamento
existe como referência textual e como dois modelos preenchíveis (`templates/`),
não como procedimento verificável dentro do repositório.**

Também não existem no repositório: `proofgate.json` (o arquivo de configuração) e
`.proofgateignore` (o arquivo de supressões persistentes). Tudo roda nos padrões
embutidos. Consequências exatas em §26.8.

### 26.3 Como se roda — a interface completa

Uso, transcrito do cabeçalho (`.proofgate/verify.sh:5-16`):

| Invocação | Efeito |
|---|---|
| `bash verify.sh` | portão rápido, sem build |
| `bash verify.sh --build` | inclui o build (pré-lançamento) |
| `bash verify.sh --strict` | avisos viram falhas |
| `bash verify.sh --smoke` | roda também as checagens de produção (`config.smoke`) |
| `bash verify.sh --json` | imprime o veredito em JSON no stdout (logs vão para stderr) |
| `bash verify.sh --only <guard>` | roda um único guard pelo nome (nenhum veredito é escrito) |
| `bash verify.sh --dry-run` | mostra o que rodaria, não roda nada |
| `bash verify.sh --base <ref>` | base do diff (padrão: merge-base com o branch default do origin) |
| `bash verify.sh --report <file>` | escreve também um relatório markdown |
| `bash verify.sh -h` / `--help` | imprime o próprio cabeçalho (`grep '^#' "$0"` filtrado por `sed 's/^# \{0,1\}//'`) e sai 0 |

Flag desconhecida é erro: `echo "unknown flag: $1 (see --help)" >&2; exit 1`
(`.proofgate/verify.sh:41`).

**Códigos de saída do portão:** `0` = passou (avisos permitidos, salvo `--strict`)
· `1` = FALHOU (`.proofgate/verify.sh:16,332`).

O script começa mudando para a raiz do repositório:
`cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"` (`.proofgate/verify.sh:46`),
e exporta `PROOFGATE_CFG="proofgate.json"` e `PROOFGATE_LIB="<dir>/lib.sh"`
(`.proofgate/verify.sh:49-50`). Se o `lib.sh` não existir, `cfg` é substituída por
uma função vazia — "ultra-degraded: no lib, no config" (`.proofgate/verify.sh:53`).

> Fragilidade dedutível do código: nesse modo degradado **só** `cfg` é stubada. A
> função `record()` chama `pg_json_escape` (`.proofgate/verify.sh:63`), que mora no
> `lib.sh`; sem a biblioteca, nomes e detalhes do veredito sairiam vazios. O portão
> não falha por isso (não há `set -e`; a linha 26 é `set -uo pipefail`), mas o
> veredito fica sem conteúdo.

### 26.4 Ordem de execução, passo a passo

1. **Cabeçalho**: `── ProofGate · mechanical gate ─────` (`.proofgate/verify.sh:89`).
2. **Detecção de stack** (`.proofgate/verify.sh:92-97`): `PM` é `pnpm` se existir
   `pnpm-lock.yaml`; `yarn` se `yarn.lock`; `bun` se `bun.lockb` ou `bun.lock`;
   `npm` se `package-lock.json` **ou** `package.json`. Neste repositório: `npm`
   (existe `package-lock.json`).
3. **`run_named typecheck`, `lint`, `test`** (`.proofgate/verify.sh:173-175`).
   Cada um: se `proofgate.json` define `.commands.<nome>`, esse comando ganha e roda
   como `bash -c` com o rótulo `"<nome> (proofgate.json)"` (`.proofgate/verify.sh:102-103`);
   senão vale a auto-detecção (`.proofgate/verify.sh:104-140`), que reconhece scripts
   do `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml` + `mypy`/`ruff`/`pytest`,
   `*.sln`/`*.csproj`, `mix.exs`, `deno.json(c)`, `Gemfile` (rspec/rake),
   `composer.json`, `./gradlew`, `pom.xml`. Aqui casa `has_script`, que é
   `grep -q "\"$1\"[[:space:]]*:" package.json` (`.proofgate/verify.sh:98`), então
   rodam `npm run typecheck`, `npm run lint`, `npm test`.
4. **Build**: só com `--build`; sem ela, a nota
   `build NOT run (use --build before releasing)` (`.proofgate/verify.sh:176`).
5. **Estado do git** (`.proofgate/verify.sh:179-192`), dois checks com nome fixo:
   - `git-committed`: `git status --porcelain` vazio → ✅
     `working tree clean (everything committed)`; caso contrário **❌**
     `UNCOMMITTED changes present — commit before declaring done`.
   - `git-pushed`: com upstream e `HEAD == @{u}` → ✅
     `HEAD pushed (matches <upstream>)`; se difere → **⚠️**
     `HEAD not pushed yet — the push itself is the gated step (push-guard checks this verdict)`;
     sem upstream → nota `branch has no upstream — push with: git push -u origin <branch>`.
6. **Smoke de produção**, só com `--smoke` (`.proofgate/verify.sh:195-222`). Ver §26.8.1.
7. **Base do diff e guards** (`.proofgate/verify.sh:225-284`). Ver §26.5 e §26.9.
8. **Armadilha do diff sem fonte** (`sourceless-diff`) (`.proofgate/verify.sh:267-281`).
9. **Veredito impresso** (`.proofgate/verify.sh:287-296`).
10. **Veredito em JSON + livro-caixa** (`.proofgate/verify.sh:300-314`).
11. **Resumo do GitHub Actions**, se `GITHUB_STEP_SUMMARY` existir (`.proofgate/verify.sh:317-325`).
12. **Relatório markdown**, se `--report` (`.proofgate/verify.sh:327-330`).

Todo passo externo roda sob `with_timeout`, que é `timeout --foreground "$TMO" "$@"`
quando `timeout` existe, e o comando cru quando não existe (`.proofgate/verify.sh:76`).
`TMO` vem de `.timeoutSeconds`, **padrão 900 segundos** (`.proofgate/verify.sh:55`).
Passo que estoura o tempo volta com código 124 e o portão anota
`" (timed out after ${TMO}s)"` (`.proofgate/verify.sh:83`), imprimindo as **últimas
5 linhas** do log (`tail -5 "$log" | sed 's/^/     /'`, `.proofgate/verify.sh:84`).

Ordem confirmada empiricamente por `bash .proofgate/verify.sh --dry-run` nesta
sessão: os três passos nomeados, a nota de build, os dois checks de git, e então os
25 guards em ordem numérica de `10-secrets.sh` a `99-dead-allow.sh`.

### 26.5 A regra que governa tudo: `base..HEAD`, nunca a árvore de trabalho

O portão lê **commits**, não o disco. A base é computada assim
(`.proofgate/verify.sh:225-229`):

```
DEFAULT_BRANCH = git symbolic-ref --short refs/remotes/origin/HEAD   (sem o prefixo "origin/")
   se vazio: tenta origin/main, depois origin/master
BASE_REF = git merge-base "origin/$DEFAULT_BRANCH" HEAD
```

Depois exporta `PROOFGATE_BASE="$BASE_REF"` e `PROOFGATE_STRICT="$STRICT"` para os
guards (`.proofgate/verify.sh:233`). Todo guard começa com
`BASE="${PROOFGATE_BASE:?}"` — ou seja, **morre se a variável não estiver
definida**; nenhum guard sabe descobrir a base sozinho.

Os guards só rodam quando
`[ -n "$BASE_REF" ] && [ "$BASE_REF" != "$(git rev-parse HEAD)" ]`
(`.proofgate/verify.sh:232`). Fora disso o portão emite ⚠️
`empty diff against the default branch (nothing to deliver? or fetch origin first)`
com o nome `diff-base` (`.proofgate/verify.sh:283`).

**Consequência prática, registrada no `CLAUDE.md`:** "A proofgate lê `base..HEAD`,
não a árvore de trabalho. Marcador de justificativa em arquivo sem commit não
existe para ela. Commit primeiro, depois confira." O corolário é o check
`git-committed`: árvore suja é ❌, exatamente para que ninguém confunda "escrevi"
com "está no diff".

**Assimetria entre `--only` e a execução completa.** No caminho `--only` a base tem
um terceiro fallback: `git rev-parse HEAD~1` (`.proofgate/verify.sh:145`). Na
execução completa **não há** esse fallback (`.proofgate/verify.sh:225-229`) — sem
`origin/HEAD`, `origin/main` nem `origin/master` alcançáveis, a base fica vazia e
todos os guards são pulados com um único ⚠️.

**A base no CI.** O job `gate` faz `actions/checkout@v4` com `fetch-depth: 0`
justamente porque "o portão lê o diff contra a base, então precisa do histórico"
(`.github/workflows/ci.yml:55-58`).

#### 26.5.1 A armadilha do portão cego (`sourceless-diff`)

Documentada em comentário longo (`.proofgate/verify.sh:267-273`) e implementada em
`.proofgate/verify.sh:274-281`:

> A base padrão é o merge-base com o branch default — então, uma vez que o trabalho
> é fast-forwarded sobre ele, a base **anda junto com o trabalho** e o diff guardado
> encolhe para o que aterrissou depois da promoção (em geral um commit de
> documentação). Todo guard baseado em diff imprime então sua linha tranquilizadora
> de "nada foi tocado": verde, e cego, exatamente quando a entrega acabou de ser
> publicada. Guards não conseguem pegar isso sozinhos — de dentro de um guard, um
> diff vazio é indistinguível de um diff limpo. Só o motor sabe o tamanho do diff
> que entregou a eles.

A implementação conta arquivos de código no diff:

```
SRC_GLOBS = cfg '.sourceGlobs'   (padrão: src/|lib/|app/)
SRC_IN_DIFF = git diff --name-only BASE..HEAD
   | grep -Ev '(guards\.d/|^\.proofgate/)'
   | grep -E "($SRC_GLOBS)"
   | grep -Ec '\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|cs|php)$'
```

Se `SRC_IN_DIFF == 0`, sai ⚠️ com o nome `sourceless-diff` e o texto:
`"sourceless-diff: the guarded diff has NO source file (docs/config only). If you just promoted this work, the diff guards above are BLIND — their ✅ means 'nothing to look at', not 'nothing wrong'. Re-run with --base <sha before the block>."`
(`.proofgate/verify.sh:280`).

#### 26.5.2 As três exceções à regra do diff

Três guards **não** leem só o diff — é preciso saber disso para não confiar demais:

1. **`48-pipeline-exit-code`** lista os nomes de arquivo do diff, mas depois abre e
   varre o **arquivo inteiro na árvore de trabalho**
   (`while IFS= read -r line; do … done < "$file"`,
   `.proofgate/guards.d/48-pipeline-exit-code.sh:34-40`), e pula o que não existe em
   disco (`[ -f "$file" ] || continue`, linha 29).
2. **`60-large-files`** mede o tamanho com `wc -c < "$f"` no **arquivo em disco**
   (`.proofgate/guards.d/60-large-files.sh:15`), não no blob do commit, e pula o que
   não existe (linha 14).
3. **`92-superuser-verification`** decide se deve rodar com
   `git grep -qiE 'create policy|enable row level security'` sobre a **árvore atual**
   (`.proofgate/guards.d/92-superuser-verification.sh:19`).

### 26.6 As quatro classes de saída, e o contrato de um guard

O motor tem quatro funções de saída (`.proofgate/verify.sh:71-74`):

| Função | Prefixo | Efeito no veredito |
|---|---|---|
| `ok`   | `✅ `  | `status: pass` |
| `warn` | `⚠️  ` | `WARNS++`, `status: warn`, anotação `::warning` no GitHub |
| `fail` | `❌ `  | `FAILS++`, `status: fail`, anotação `::error` no GitHub |
| `note` | `▫️  ` | `status: note`, não conta para nada |

O nome do check, quando não é passado explicitamente, é derivado por `_slug`
(`.proofgate/verify.sh:61`):

```
_slug() { printf '%s' "$1" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-.*$//'; }
```

O último trecho (`s/-.*$//`) **corta no primeiro hífen**, então o slug é a primeira
palavra: `"typecheck (npm)"` → `typecheck`; `"tests (npm)"` → `tests`;
`"build NOT run (use --build before releasing)"` → `build` (verificado rodando a
expressão). Por isso os checks `git-committed` e `git-pushed` passam o nome
explicitamente (`.proofgate/verify.sh:180-191`) — o slug deles seria `working` e `head`.

**Contrato de um guard**, transcrito de `.proofgate/guards.d/TEMPLATE.sh.example:5-11`:

```
env  PROOFGATE_BASE   — git ref to diff against (always set by the runner)
env  PROOFGATE_CFG    — path to proofgate.json (may not exist)
env  PROOFGATE_LIB    — path to lib.sh (optional; source it for the helpers below)
env  PROOFGATE_STRICT — "1" when --strict (rarely needed; the runner promotes warns)
exit 0 = pass · 1 = FAIL (blocks the gate) · 2 = WARN (must be justified)
print ONE ✅/⚠️/❌ line (the runner streams your output verbatim)
```

"Renomeie para `NN-name.sh` (`NN` ordena a execução) e jogue em `guards.d/` —
pronto" (`.proofgate/guards.d/TEMPLATE.sh.example:13`).

Observação verificada: `PROOFGATE_STRICT` é exportada (`.proofgate/verify.sh:233`)
e **nenhum guard desta cópia a lê** — só o `TEMPLATE.sh.example:9` a menciona. A
promoção de aviso a falha é feita pelo motor.

**Como o motor lê a saída de um guard** (`.proofgate/verify.sh:250-262`):

- roda `bash "$guard"` sob `with_timeout`, captura stdout+stderr em `OUT` e o
  código em `CODE`;
- `CODE == 124` (timeout) é reescrito para `OUT="⚠️  $gname: timed out after ${TMO}s"`
  e `CODE=2`;
- imprime `OUT` **verbatim**, linha a linha;
- `0` → `pass`; `1` → `FAILS++` e `fail`; `2` → `WARNS++` e `warn`;
- **qualquer outro código (3, 127, 130…) não é contado como nada** — cai fora do
  `case` e vira silêncio. Um guard que morre com 127 (comando não encontrado) não
  reprova o portão.

**Nome do guard**: `basename "$guard" .sh | sed -E 's/^[0-9]+-//'`
(`.proofgate/verify.sh:244`) — o número é só ordem, o nome é o resto. Por isso
`--only dead-allow`, não `--only 99-dead-allow`.

**`--strict`** (`.proofgate/verify.sh:288-290`): havendo qualquer aviso, imprime
`❌ GATE FAILED (--strict): N warning(s) treated as failures.` e soma `FAILS += WARNS`.

**`--only`** (`.proofgate/verify.sh:144-171`): procura o guard pelo nome em
`guards.d/` **e** em cada diretório de `.guardsDirs`; roda um só; imprime a saída; e
sai com `1` apenas se o guard saiu com `1` — **um ⚠️ em `--only` sai 0**
(`.proofgate/verify.sh:165`). Nenhum veredito é escrito. Se não achar,
`no guard named '<nome>' (looked in: …)` em stderr e saída 1
(`.proofgate/verify.sh:170`). O comentário (`.proofgate/verify.sh:147-151`) registra
a cicatriz: procurar só no `guards.d/` do motor deixava os guards do próprio projeto
inalcançáveis em isolamento — "o guard que um mantenedor mais quer iterar (o que
acabou de escrever) era o único que `--only` não conseguia rodar, e confirmar que
ele tinha ao menos EXECUTADO significava garimpar o livro-caixa do veredito".

Verificado nesta sessão: `bash .proofgate/verify.sh --only dead-allow` imprime só o
cabeçalho e a linha do guard, e sai 0 — os passos de typecheck/lint/test **não**
rodam, porque o bloco `--only` está antes deles no arquivo.

### 26.7 Como se justifica um ⚠️

Há cinco mecanismos, com escopos diferentes.

#### (a) `proofgate-allow` na própria linha

A primitiva `pg_added_with_file` descarta toda linha adicionada que contenha a
string `proofgate-allow` (`.proofgate/lib.sh:128-131`):

```awk
/^\+\+\+ b\// { f=substr($0,7); next }
/^\+/ && !/^\+\+\+/ { l=substr($0,2); if (l !~ /proofgate-allow/) print f "\t" l }
```

O marcador vale **só para a linha em que está escrito**. Escrito no comentário de
cima, não suprime nada. Isso foi um erro real: "Eu tinha escrito `proofgate-allow`
três vezes em linhas de **comentário**, acima do código apontado. O portão filtra
`if (l !~ /proofgate-allow/)` sobre a própria linha adicionada… Os três liam como
'já justificado' e o portão continuava contando ⚠️ — ninguém percebeu porque o
resumo só mostra o número" (`docs/insights.md:598-604`). A resposta foi o guard
`99-dead-allow` (§26.9.25).

#### (b) `.proofgateignore` — impressão digital por achado

`pg_ignored <fingerprint>` procura a linha exata em `.proofgateignore` na raiz
(`grep -Fxq`, `.proofgate/lib.sh:110-114`); a variável `PROOFGATE_IGNORE` troca o
caminho. A impressão digital é (`.proofgate/lib.sh:96-102`):

```
pg_fingerprint <guard> <file> <line-content>  →  "<guard>:<file>:<hash12>"
hash12 = primeiros 12 caracteres de sha1sum (ou shasum, ou cksum) do CONTEÚDO da linha
```

Deliberadamente **não** o número da linha — é estável a churn
(`.proofgate/lib.sh:92-95`; "espelha a ideia de fingerprint do gitleaks"). O
comentário explica por que não existe *baseline* completo: "o portão é DIFF-SCOPED
(só as linhas adicionadas em `$BASE..HEAD`), então achados legados nunca se
acumulam como num scanner de repositório inteiro — uma baseline/ratchet seria
over-engineering. O que ainda falta é uma escotilha durável para um falso positivo
específico que você não consegue anotar inline (por exemplo, um arquivo gerado):
uma impressão digital por linha em `.proofgateignore`, com comentários `#`
permitidos" (`.proofgate/lib.sh:105-109`).

**Estado: o arquivo `.proofgateignore` NÃO EXISTE neste repositório.** Nenhum
achado está suprimido por impressão digital hoje.

#### (c) Configuração em `proofgate.json`

- `"skip": ["nome-do-guard"]` — o guard nem roda; o portão imprime a nota
  `guard <nome> skipped (proofgate.json)` (`.proofgate/verify.sh:246`).
- `"severity": { "<guard>": "off" | "warn" | "fail" }` (`.proofgate/verify.sh:247-256`):
  - `off` → nota `guard <nome> disabled (severity off)`, guard não roda;
  - `fail` → qualquer código diferente de 0 vira 1 (aviso vira falha);
  - `warn` → código 1 vira 2 (falha vira aviso).
  Nos dois últimos, o motor imprime a nota
  `severity override: <nome> → <sev> (proofgate.json)` — **sempre que a chave
  existir**, mesmo que a classe não tenha mudado.
- `"secretAllowlist": ["regex", …]` — específico do guard `10-secrets` (§26.9.1).

#### (d) A justificativa escrita — a regra de produto

O `CLAUDE.md` é categórico: "Qualquer ❌ significa que não está pronto, e todo ⚠️
pede justificativa escrita — nunca dispensa em silêncio". O motor diz o mesmo na
linha de sucesso: `"✅ Mechanical gate passed (N warning(s) — justify each in your status.)"`
(`.proofgate/verify.sh:294`). E o modelo de relatório carrega o campo obrigatório:

```
Justification for each ⚠️ (mandatory — silence is not a justification):

- ⚠️ `<warning>` → <why it is acceptable HERE, or the issue that tracks it>
```

(`.proofgate/templates/evidence-report.md:13-15`)

#### (e) A autoexclusão do próprio portão

Os guards contêm literalmente os padrões que perseguem, então a biblioteca define
os pathspecs de autoexclusão (`.proofgate/lib.sh:121`):

```
PG_SELF_EXCLUDE=(
  ':(exclude)*guards.d/*'
  ':(exclude)*/.proofgate/*'
  ':(exclude).proofgate/*'
  ':(exclude)*/scripts/verify.sh'
  ':(exclude)*/scripts/lib.sh'
  ':(exclude)*run-tests.sh'
  ':(exclude)*push-guard.sh'
  ':(exclude)*stop-guard.sh'
)
```

Sem isso, "vendorizar os guards num repositório consumidor adiciona arquivos cujo
texto literalmente CONTÉM os padrões do pecado (`rejectUnauthorized:false`,
`<<<<<<<`, as regexes de chave); sem isso todo guard reprovaria o próprio commit
que o instala" (`.proofgate/lib.sh:116-120`).

### 26.8 Configuração: `proofgate.json`

**Estado: o arquivo NÃO EXISTE neste repositório.** Tudo abaixo roda no padrão.
Estas são exatamente as chaves que **esta cópia** lê (levantadas por varredura de
todas as chamadas a `cfg`/`cfg_list`/`cfg_len` em `.proofgate/`):

| Chave | Lida em | Padrão embutido | Efeito |
|---|---|---|---|
| `.commands.typecheck` / `.lint` / `.test` / `.build` | `verify.sh:102` | auto-detecção | comando roda via `bash -c` |
| `.timeoutSeconds` | `verify.sh:55` | `900` | teto de cada passo e de cada guard |
| `.sourceGlobs` | `verify.sh:274`, `30-untested-changes.sh:11` | `src/\|lib/\|app/` | o que conta como código-fonte |
| `.guardsDirs` (lista) | `verify.sh:155,238` | vazio | diretórios extras de guards |
| `.skip` (lista) | `verify.sh:234` | vazio | guards que não rodam |
| `.severity."<guard>"` | `verify.sh:247` | vazio | `off` / `warn` / `fail` |
| `.secretAllowlist` (lista) | `10-secrets.sh:26` | vazio | regexes que o guard de segredos ignora |
| `.piiTerms` | `20-pii-logging.sh:11` | ver §26.9.4 | vocabulário de dado pessoal |
| `.moneyTerms` | `85-float-money.sh:12` | ver §26.9.19 | vocabulário de dinheiro |
| `.envExample` | `40-env-drift.sh:11` | `.env.example` | arquivo de exemplo de ambiente |
| `.maxFileKb` | `60-large-files.sh:10` | `2048` | teto de tamanho de arquivo |
| `.coupledFiles[i].a` / `.b` / `.reason` | `50-coupled-files.sh:18-19` | vazio | pares que devem mudar juntos |
| `.smoke[i].name` / `.url` / `.cmd` / `.expect` / `.status` | `verify.sh:203-204` | vazio; `status` cai em `200` | checagens de produção |
| `.pushGuard` | `hooks/push-guard.sh:53` | ligado | `false` desliga o gancho |

Nenhuma outra chave é lida por esta cópia. (O `examples/proofgate.json` do motor de
origem documenta chaves adicionais — `impact`, `memory`, `editGuard`, `requireProof`,
`requireSkeptic`, `liveGuards`, `audit`, `stopGuard` — que **NÃO ESTÃO NO CÓDIGO
vendorizado aqui** e não têm efeito algum neste repositório.)

Variáveis de ambiente reconhecidas:

| Variável | Lida em | Efeito |
|---|---|---|
| `PROOFGATE_BASE` | todo guard | ref de diff (o motor sempre define) |
| `PROOFGATE_CFG` | `lib.sh:19` | caminho do `proofgate.json` (padrão `proofgate.json`) |
| `PROOFGATE_LIB` | `verify.sh:50`, todo guard | caminho do `lib.sh` |
| `PROOFGATE_STRICT` | exportada em `verify.sh:233` | nenhum guard desta cópia lê |
| `PROOFGATE_IGNORE` | `lib.sh:111` | caminho do `.proofgateignore` |
| `PROOFGATE_MAX_FILE_KB` | `60-large-files.sh:10` | tem precedência sobre `.maxFileKb` |
| `PROOFGATE_HOOK_OFF` | `hooks/push-guard.sh:24` | `=1` desliga o push-guard |
| `GITHUB_ACTIONS` | `verify.sh:67` | liga anotações `::error`/`::warning` |
| `GITHUB_STEP_SUMMARY` | `verify.sh:317` | liga o resumo do job |
| `TMPDIR` | `lib.sh:166` | onde vão os temporários (`proofgate-<tag>.XXXXXX`) |

**A leitura de config não tem dependência dura.** `cfg` tenta, nesta ordem, `jq`
(`jq -c -r "$path // empty"`), depois `node` com um walker de uma linha, depois
`python3` com um walker equivalente (`.proofgate/lib.sh:49-55`). Sem nenhum dos
três, tudo degrada para vazio e o chamador usa seu próprio padrão inline. A
cicatriz está escrita no arquivo: "v1 fazia do `jq` uma dependência dura para TODA
a config e ignorava `proofgate.json` em silêncio em qualquer máquina sem `jq`. Isso
é exatamente a armadilha 'funciona na minha máquina' que o portão existe para
matar, então o leitor de config do próprio portão não pode tê-la"
(`.proofgate/lib.sh:12-15`).

A gramática de caminho aceita é **restrita**: chaves pontuadas mais índices inteiros
`[N]` (ex.: `.commands.typecheck`, `.smoke[0].url`) — "é tudo que qualquer guard
precisa; qualquer coisa mais sofisticada deve usar `jq` (e degradar para vazio sem
ele)" (`.proofgate/lib.sh:21-23`).

#### 26.8.1 Smoke de produção (`--smoke`)

**Estado: implementado, sem chamador.** Não há `smoke[]` na config (não há config),
e nem o CI nem a barra do `CLAUDE.md` passam `--smoke`.

Comportamento (`.proofgate/verify.sh:195-222`): sem entradas, nota
`smoke: no smoke checks configured (add a smoke[] array to proofgate.json)`; sem
`curl`, ⚠️ `smoke: curl not available — cannot run production smoke`. Para cada
entrada: se tiver `cmd`, roda `bash -c` e código 0 é aprovação; se tiver `url`, faz
`curl -sS --max-time "$TMO" -o <body> -w '%{http_code}'` e aprova quando o código
bate com `.status` (padrão `200`) **e** `.expect` (uma ERE) casa no corpo via
`grep -Eq`. Sem `url` nem `cmd`, nota `smoke[i]: neither url nor cmd — skipped`.

### 26.9 Os 25 guards

Ordem de execução = ordem alfabética do nome do arquivo, e por isso o prefixo
numérico. Note que `TEMPLATE.sh.example` **não roda**: o laço é
`for guard in "$gdir"/*.sh` (`.proofgate/verify.sh:242`) e o molde não termina em
`.sh`.

Quatro guards podem reprovar (❌): `10-secrets`, `12-merge-markers`, `15-tls-off`,
`70-debug-leftovers`. Os outros vinte e um só avisam (⚠️).

> Nota histórica: `docs/insights.md:966` fala em "vinte e duas guardas numeradas"
> (1 de setembro) e `.github/workflows/ci.yml:67` fala em "Nineteen guards" — **os
> dois números estão desatualizados**; hoje são 25.

#### 26.9.1 — `10-secrets` · segredos (❌ / ⚠️)

Detecta credenciais adicionadas no diff. **Formatos de provedor de alto sinal são
❌** (`.proofgate/guards.d/10-secrets.sh:14`):

```
AKIA[0-9A-Z]{16}
ghp_[A-Za-z0-9]{36,}
github_pat_[A-Za-z0-9_]{20,}
xox[baprs]-[A-Za-z0-9-]{10,}
sk-[A-Za-z0-9]{32,}
sk_live_[A-Za-z0-9]{20,}
AIza[0-9A-Za-z_-]{35}
-----BEGIN [A-Z ]*PRIVATE KEY-----
eyJhbGciOi[A-Za-z0-9_-]{20,}\.
```

**Atribuição genérica de valor opaco a campo de nome sensível é ⚠️**
(`.proofgate/guards.d/10-secrets.sh:16`):

```
(api[_-]?key|apikey|secret|token|passwd|password|client[_-]?secret|access[_-]?token)["']?[[:space:]]*[:=][[:space:]]*["'][A-Za-z0-9+/_=-]{20,}["']
```

Valores que só *parecem* segredo nunca são marcados (`:18`):

```
example|sample|placeholder|changeme|change-me|your[_-]|dummy|redacted|xxx+|\.\.\.|<[a-z]|\$\{|process\.env|os\.environ|import\.meta
```

Exclusões de caminho, além de `PG_SELF_EXCLUDE` (`:20-23`): `*.lock`, `*lock.yaml`,
`*lock.json`, `*.env.example`, `*.env.sample`.

Supressão: `proofgate-allow` na linha, ou regexes em `.secretAllowlist` — juntadas
com `paste -sd '|'` e aplicadas como `grep -Ev` (`:26-31`).

Mensagem ❌ (`:35`): `"secrets: N added line(s) look like credentials (API key/token/private key). Remove and ROTATE them — a pushed secret is a burned secret."`,
seguida de até 5 linhas truncadas em 60 caracteres (`:36`).
Mensagem ⚠️ (`:42`): `"secrets: N added line(s) assign a long opaque value to a secret-named field — if that's a real credential, move it to an env var. (Test fixture? proofgate-allow or secretAllowlist.)"`

Razão declarada: "uma credencial vazada é a única linha de código mais cara que você
pode publicar" (`:3`).

> Detalhe de implementação: este guard não usa `pg_scan`; monta o próprio `DIFF()` e
> filtra com `grep -E '^\+'`, o que inclui também as linhas de cabeçalho `+++ b/…`
> do diff. Na prática os padrões não casam caminhos, mas a diferença existe.

#### 26.9.2 — `12-merge-markers` · marcadores de conflito (❌)

Padrão (`.proofgate/guards.d/12-merge-markers.sh:11`): `^(<{7}|>{7}|\|{7})([ \t]|$)`.

Deliberadamente **não** casa `=======` sozinho: "isso é um sublinhado legal de H1 em
Markdown / régua em RST, um falso positivo garantido" (`:6-7`).

Cicatriz: "um bloco `<<<<<<< HEAD` publicado num branch compila em algumas linguagens
(fica dentro de string/comentário) e detona em runtime; na maioria quebra o build
direto — de um jeito ou de outro é o 'ninguém leu o diff' mais alto possível" (`:3-5`).

Mensagem: `"merge-markers: N added line(s) carry unresolved conflict markers — resolve the merge before shipping."`

#### 26.9.3 — `15-tls-off` · verificação de TLS desligada (❌ / ⚠️)

**❌ para desligamentos no código** (`.proofgate/guards.d/15-tls-off.sh:13`):

```
rejectUnauthorized[[:space:]]*:[[:space:]]*false
verify[[:space:]]*=[[:space:]]*False
InsecureSkipVerify[[:space:]]*:[[:space:]]*true
NODE_TLS_REJECT_UNAUTHORIZED[[:space:]]*[:=][[:space:]]*.?0
CURLOPT_SSL_VERIFYPEER[[:space:]]*,[[:space:]]*(0|false)
ssl[._]?verify[[:space:]]*[:=][[:space:]]*(false|no|0)
```

Exclusões: `*test*`, `*spec*`, `*fixture*`, `*.md` (`:14`).

**⚠️ para `curl -k`/`--insecure`** (`:18`):
`curl([[:space:]]+-[[:alnum:]]*k|[[:space:]]+--insecure)`, excluindo `*.md`.

A escolha de severidade tem justificativa escrita: "um `curl -k` num script de shell
é ⚠️, não ❌: scripts locais/dev com certificado autoassinado o usam legitimamente,
e **um ❌ errado por semana é como um portão vira apelido de `true`** (cultura de
bypass)" (`:5-7`).

Cicatriz: "'só faz esse erro de certificado sumir' publica `rejectUnauthorized: false`
em produção e toda chamada HTTPS que ele faz vira um MITM silencioso esperando
acontecer" (`:3-5`).

#### 26.9.4 — `20-pii-logging` · dado pessoal indo para log (⚠️)

Exige as duas coisas **na mesma linha**: um sink de log **e** um termo de dado
pessoal (`.proofgate/guards.d/20-pii-logging.sh:16-17`).

Sinks (`:14`):

```
console\.(log|error|warn|info)|logger\.|logging\.|log\.(info|warn|error|debug)|print\(|println!|captureException|captureMessage|Sentry|track\(
```

Termos padrão (`:12`, configurável por `.piiTerms`):

```
password|passwd|ssn|social.?security|cpf|credit.?card|card.?number|cvv|phone|e-?mail|date.?of.?birth|birth.?date|medical|diagnosis|health|address|passport
```

Extensões varridas (`:16`): `*.ts *.tsx *.js *.jsx *.py *.rb *.go *.rs *.java *.kt`
mais `PG_SELF_EXCLUDE`.

Razão: "dado pessoal num arquivo de log sobrevive a toda política de retenção que
você acha que tem" (`:3`).

Mensagem: `"PII→logs: N added line(s) both log AND mention personal-data terms — check nothing sensitive is serialized (term list: piiTerms in proofgate.json)"`.

#### 26.9.5 — `25-silent-catch` · erro engolido (⚠️)

Padrão (`.proofgate/guards.d/25-silent-catch.sh:11`):

```
catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}
except[^:]*:[[:space:]]*pass[[:space:]]*$
rescue[[:space:]]+nil[[:space:]]*$
rescue[[:space:]]*=>[[:space:]]*[[:alnum:]_]+[[:space:]]*$
```

Exclui `*.md`.

Escopo declarado: **só o handler vazio de uma linha** — "um corpo multilinha com
tratamento real está fora de escopo" (`:6-7`).

Cicatriz: "`catch (e) {}` / `except: pass` / `rescue nil` num caminho de dinheiro,
autenticação ou escrita transforma uma falha real numa tela verde — o pagamento
silenciosamente não passou, o token silenciosamente não rotacionou, e você descobre
pelo usuário" (`:3-6`).

#### 26.9.6 — `30-untested-changes` · fonte mexida, teste nenhum (⚠️)

Conta arquivos (`.proofgate/guards.d/30-untested-changes.sh:13-15`):

```
CHANGED = git diff --name-only BASE..HEAD  menos  (guards\.d/|/\.proofgate/|^\.proofgate/|scripts/verify\.sh|scripts/lib\.sh)
SRC_N   = CHANGED que casa (sourceGlobs), NÃO casa (\.test\.|\.spec\.|__tests__|_test\.|/tests?/),
          e termina em .ts .tsx .js .jsx .py .rb .go .rs .java .kt
TEST_N  = CHANGED que casa (\.test\.|\.spec\.|__tests__|_test\.|/tests?/)
```

⚠️ só quando `SRC_N > 0` **e** `TEST_N == 0`. Caso contrário imprime o placar:
`"tests-changed: N source / M test file(s) in the diff"` — um dos poucos guards que
informa mesmo passando. No veredito atual: `100 source / 40 test file(s)`.

Racional escrito: "nem todo diff precisa de teste novo — mas 'nenhum deles precisa'
é como regressão é publicada" (`:3`).

> Discrepância dedutível: a lista de extensões deste guard (`:14`) **não** inclui
> `swift|cs|php`, que a mesma checagem no motor (`.proofgate/verify.sh:278`) inclui.
> Num repositório Swift/C#/PHP o `sourceless-diff` e este guard discordam sobre o que
> é código.

#### 26.9.7 — `35-dependency-change` · manifesto sem lockfile (⚠️)

Pares manifesto→lockfiles verificados (`.proofgate/guards.d/35-dependency-change.sh:41-47`):

| Manifesto | Lockfiles que o liberam |
|---|---|
| `package.json` | `pnpm-lock.yaml` `package-lock.json` `yarn.lock` `bun.lockb` `bun.lock` `npm-shrinkwrap.json` |
| `Cargo.toml` | `Cargo.lock` |
| `go.mod` | `go.sum` |
| `pyproject.toml` | `poetry.lock` `uv.lock` `pdm.lock` |
| `Gemfile` | `Gemfile.lock` |
| `composer.json` | `composer.lock` |
| `mix.exs` | `mix.lock` |

Para manifestos `*.json` o guard **não** usa heurística: extrai os blocos que decidem
resolução nas duas revisões e compara (`:21-35,56-62`). As chaves comparadas são
exatamente (`:24`):

```
dependencies devDependencies peerDependencies optionalDependencies overrides resolutions require require-dev
```

Blocos iguais → segue em frente, aconteça o que acontecer no resto do arquivo. Sem
`python3` nem `jq`, `json_deps` retorna 1 e o guard **cai no heurístico antigo em vez
de chutar** (`:19-20`): "uma linha adicionada com especificador de versão", isto é
`grep -Ec '[">=~^]|require |gem |implementation '` (`:65`).

**Erro real que o originou** (`docs/insights.md:695-712`): "Toda execução do portão
trazia a mesma ⚠️: 'manifesto mudou sem o lockfile'. Eu justificava em prosa toda
vez… O guard testava se a linha adicionada **parecia** uma dependência: aspas,
circunflexo, til. **Em JSON toda linha parece.** Acrescentar o script `mutate` ao
`package.json` exigia lockfile novo, e nenhum lockfile poderia mudar." E a lição de
produto: "alerta inventado ensina a ignorar alerta. Um aviso que erra sempre não
custa só o tempo de conferir — ele treina a passar os olhos por cima da lista, e é lá
que o aviso verdadeiro vai estar um dia."

O próprio guard também explica por que não avisa em toda subida de dependência:
"avisar em todo bump seria puro ruído — times que querem o comportamento 'justifique
cada dep nova' podem subir a severidade deste guard na config" (`:5-7`).

Mensagem: `"dependency-change: manifest changed without its lockfile (<manifestos>) — CI will resolve versions you never tested. Commit the updated lockfile."`

#### 26.9.8 — `40-env-drift` · variável de ambiente não declarada (⚠️)

Extrai nomes de variáveis lidas nas linhas adicionadas
(`.proofgate/guards.d/40-env-drift.sh:16-19`), reconhecendo:

```
process.env.X · import.meta.env.X (Vite) · Deno.env.get("X")
os.environ["X"] / os.environ.get("X") · os.Getenv("X") · ENV['X']
```

e depois filtra o nome com `grep -oE '[A-Z_][A-Z0-9_]{2,}$'` — ou seja, **nomes com
menos de 3 caracteres escapam**. Extensões varridas: `*.ts *.tsx *.js *.jsx *.mjs
*.cjs *.py *.rb *.go`.

Considera declarada a variável cuja linha do arquivo de exemplo comece com `X=` ou
`# X=` (`:23`).

**Estado neste repositório: pulado.** Não existe `.env.example`, e o guard sai cedo
com `"✅ env-drift: no .env.example in repo — guard skipped"` (`:12`) — confirmado no
veredito atual (`.git/proofgate-verdict.json`).

Mensagem quando dispara: `"env-drift: code now reads <VARS> but <EXAMPLE> doesn't declare it — first fresh deploy will crash"`.

#### 26.9.9 — `45-broad-process-kill` · matar processo por padrão (⚠️)

Padrão (`.proofgate/guards.d/45-broad-process-kill.sh:17`):

```
pkill|killall|kill[[:space:]]+-[0-9A-Za-z]+[[:space:]]+\$\(pgrep|kill[[:space:]]+\$\(pgrep|taskkill[[:space:]]+/IM
```

Exclui `*.md`.

**Cicatriz literal** (`:5-8`): "`pkill -f "verify.sh"` foi rodado para parar uma
verificação velha. Matou também a que tinha acabado de começar — a nova e a antiga
casam o mesmo nome. Um ciclo inteiro se perdeu, e a saída que voltou pareceu um crash
em vez de um tiro no próprio pé, que é a parte cara: os vinte minutos seguintes foram
depurar um fantasma." E a generalização (`:10-12`): "qualquer coisa que seleciona
vítimas por padrão tem essa forma: ela não consegue distinguir o seu processo do de
outra pessoa, incluindo o seu próprio processo futuro."

A mesma cicatriz é regra de operação no `CLAUDE.md`: "Nunca mate processo por
padrão… Se precisar parar algo, pare pelo PID que você mesmo anotou."

#### 26.9.10 — `47-unquoted-globstar` · `**` sem aspas em script npm (⚠️)

Só olha arquivos `*package.json` (`.proofgate/guards.d/47-unquoted-globstar.sh:23`).
Um achado exige: o conteúdo casar `GLOB` **e não** casar `QUOTED` (`:18-19,24-25`):

```
GLOB   = "[a-zA-Z0-9:_-]+"[[:space:]]*:[[:space:]]*"[^"]*\*\*[^"]*"
QUOTED = ['\\]
```

**Erro real** (`.proofgate/guards.d/47-unquoted-globstar.sh:4-9` e
`docs/insights.md:800-814`): o script era `"test": "tsx --test src/**/*.test.ts"`.
"O shell expande isso antes do runner ver, e sem `globstar` ele lê `**` como um nível
de diretório só. Um arquivo de teste um nível mais raso — ou três níveis mais fundo —
simplesmente nunca é executado, e a suíte reporta sucesso para um arquivo que nunca
abriu. **Um teste que não roda é indistinguível de um teste que passa**; este se
escondeu enquanto ninguém contou." O conserto foi de dois caracteres e a suíte foi de
131 para 134 testes.

Hoje o `package.json:13` está com o glob entre aspas:
`"test": "tsx --test 'src/**/*.test.ts'"`.

Mensagem: `"unquoted-globstar: N script(s) pass an unquoted ** glob to the shell, which flattens it to one directory level — files outside that level are skipped in silence. Quote the pattern so the tool expands it."`

#### 26.9.11 — `48-pipeline-exit-code` · `$?` depois de pipeline (⚠️)

Só arquivos `*.sh|*.bash|*.bats` que **existam em disco** e **não** tenham pipefail
(`.proofgate/guards.d/48-pipeline-exit-code.sh:28-30`); a detecção de pipefail é
`grep -Eq 'set[[:space:]]+-[a-z]*o[[:space:]]+pipefail|set[[:space:]]+-[a-z]*eo[[:space:]]+pipefail'`.

Formatadores cujo status nunca é a resposta (`:24`):

```
\|[[:space:]]*(tail|head|cut|tr|sort|uniq|column|fmt|jq|tee|less|cat)([[:space:]]|$)
```

Dispara quando uma linha com `$?` vem **imediatamente depois** de uma linha com
pipeline terminado em formatador (`:33-39`).

**Cicatriz** (`:5-12`): "`npm run e2e 2>&1 | tail -3` e depois `echo "exit: $?"`. Isso
imprime o status do `tail`, não do comando cujo sucesso estava sendo medido — e o
`tail` tem sucesso ao imprimir três linhas de uma falha. A medição leu 0 enquanto a
coisa sob teste lia 1. O que tornou caro: a execução estava checando se um guard sai
diferente de zero numa suíte vazia. 'Imprime a mensagem mas sai 0' era exatamente o
defeito sendo consertado, então a leitura errada parecia o bug se reproduzindo.
**Uma medição que pode responder silenciosamente sobre outro processo é pior que
medição nenhuma.**"

Só dispara onde `pipefail` está ausente, "porque com ele `$?` é o primeiro estágio que
falhou e a leitura é sólida" (`:14-16`).

#### 26.9.12 — `50-coupled-files` · pares que devem mudar juntos (⚠️)

Lê `.coupledFiles[]` da config: cada entrada tem `a`, `b` e `reason` (padrão da razão:
`"they must move together"`, `.proofgate/guards.d/50-coupled-files.sh:19`). A
comparação é `grep -cx` do caminho na lista de mudados: se as contagens de `a` e `b`
diferem, é drift (`:20-24`).

Mensagem: `"coupled-files: <a> and <b> did NOT change together (<reason>)"`.

Exemplos de uso citados no cabeçalho (`:2-4`): esquema do ORM ↔ espelho SQL, contrato
de API ↔ tipos do cliente, chaves de i18n ↔ traduções. "Um lado se movendo sozinho é
drift silencioso que você só encontra em produção."

**Estado neste repositório: implementado, sem chamador.** Sem `proofgate.json`,
`cfg_len '.coupledFiles'` devolve 0 e o guard sai com
`"✅ coupled-files: no pairs configured — guard skipped"` (`:13`) — confirmado no
veredito atual. Note que os três exemplos do cabeçalho descrevem exatamente
acoplamentos que **existem** neste projeto (i18n em três idiomas, esquema do aparelho
↔ migrações do servidor) e que ninguém configurou.

#### 26.9.13 — `55-skipped-tests` · teste desligado (⚠️)

Padrão (`.proofgate/guards.d/55-skipped-tests.sh:10`):

```
\.skip[[:space:]]*\(|\bxit[[:space:]]*\(|\bxdescribe[[:space:]]*\(|@pytest\.mark\.skip|@unittest\.skip|#\[ignore\]|\bt\.Skip[[:space:]]*\(|\bit\.skip\b|\btest\.skip\b
```

Exclui `*.md`.

Cicatriz: "`.skip` / `xit` / `@pytest.mark.skip` / `#[ignore]` entra 'só para deixar o
CI verde por enquanto' e nunca volta — a suíte fica verde e mentindo. É o irmão mais
quieto do `.only` do `debug-leftovers`: **`.only` silencia os OUTROS testes, `.skip`
silencia ESTE. Os dois querem dizer que verde ≠ coberto**" (`:3-6`).

Mensagem: `"skipped-tests: N added line(s) disable a test (.skip/xit/@skip/#[ignore]/t.Skip). Green CI now hides this case — re-enable or delete it, don't mute it."`

#### 26.9.14 — `58-frozen-clock` · teste que lê o relógio real (⚠️)

Padrão (`.proofgate/guards.d/58-frozen-clock.sh:12`):

```
new Date\([[:space:]]*\)|\bDate\.now[[:space:]]*\(|\bdatetime\.(now|today|utcnow)[[:space:]]*\(|\btime\.time[[:space:]]*\(|\bTime\.now\b|time\.Now\(\)
```

Só dispara em arquivos cujo caminho contenha `test` ou `spec` (`:18`) — "o padrão é
normal em código de produto, que legitimamente lê o relógio" (`:13`). Exclui `*.md`.

**Cicatriz, declarada como vivida mais de uma vez** (`:3-8`): "um teste que paga uma
fatura de 'junho' com um `paga_em = now()` real passa verde em junho e fica vermelho
no dia 1º de julho — uma bomba-relógio que falha para quem rodar o CI no mês
seguinte, não para quem escreveu. Casos de fronteira são piores: um teste de
rate-limit balde a `floor(now/60s)` só falha quando um passo lento cruza o minuto.
Testes têm que CONGELAR o relógio."

Mensagem: `"frozen-clock: N added line(s) read the real clock inside a test (new Date()/Date.now()/datetime.now()/time.time()). Freeze it (fake timers / fixed instant) or you're shipping a time bomb."`

#### 26.9.15 — `60-large-files` · arquivo grande entrando no histórico (⚠️)

Limite: `PROOFGATE_MAX_FILE_KB` → `.maxFileKb` → **2048 KB**
(`.proofgate/guards.d/60-large-files.sh:10`). Considera arquivos adicionados ou
modificados (`--diff-filter=AM`) que existam em disco, medindo `wc -c` da árvore de
trabalho dividido por 1024 (`:13-18`).

Mensagens: `"large-files: file(s) over <MAX>KB entering history:"` seguido de
`  <arquivo> (<KB>KB)` por linha, e o rodapé
`"(binary assets belong in object storage/LFS, not git)"`.

Razão: "um 'vídeo de teste rápido' de 40MB commitado por acidente vive no seu
histórico git PARA SEMPRE — todo clone paga por ele" (`:2-3`).

#### 26.9.16 — `65-type-suppressions` · checagem silenciada (⚠️)

Padrão (`.proofgate/guards.d/65-type-suppressions.sh:11`):

```
@ts-ignore|@ts-nocheck|eslint-disable|#[[:space:]]*type:[[:space:]]*ignore|#[[:space:]]*noqa|#[[:space:]]*nosec|//[[:space:]]*nolint|@SuppressWarnings
```

Exclui `*.md`.

**Exclusão deliberada e explicada**: `@ts-expect-error` **não** é marcado — "esse
FALHA se o erro parar de acontecer, então é boa prática autolimpante, não uma
mordaça" (`:5-7`). A mensagem inclusive recomenda a troca:
`"@ts-expect-error is the self-cleaning alternative"`.

Cicatriz: "`@ts-ignore`, `# type: ignore`, `eslint-disable`, `# noqa`, `#nosec` são
como um erro real é enterrado em vez de consertado — o próximo leitor confia no verde
e o bug vai junto" (`:3-5`). É ⚠️ e não ❌ "porque há usos legítimos — mas cada um
deve uma justificativa" (`:7`).

#### 26.9.17 — `70-debug-leftovers` · sobras de depuração (❌ / ⚠️)

**❌ para teste focado** (`.proofgate/guards.d/70-debug-leftovers.sh:14`):
`\b(it|test|describe)\.only\(|\bf(describe|it)\(` — "o `.only` é o mais sorrateiro:
ele desliga silenciosamente o RESTO da suíte — o CI fica verde porque quase nada
rodou" (`:3-4`).
Mensagem: `"debug-leftovers: N focused test(s) added (.only/fdescribe/fit) — the rest of the suite is silently OFF. Green CI would be a lie."`

**⚠️ para depuração e TODO** (`:20-21`):

```
DEBUGS = \bdebugger\b|console\.log\(|binding\.pry|breakpoint\(\)
TODOS  = \b(TODO|FIXME|HACK)\b
```

Mensagem: `"debug-leftovers: N debug statement(s) + M fresh TODO/FIXME in the diff — shipping them? justify in your status"`.

Extensões varridas (`:12`): `*.ts *.tsx *.js *.jsx *.py *.rb *.go *.rs` + `PG_SELF_EXCLUDE`.

**Estado neste repositório: dispara hoje.** O veredito atual traz
`⚠️ debug-leftovers: 2 debug statement(s) + 3 fresh TODO/FIXME in the diff`
(`.git/proofgate-verdict.json`), e o livro-caixa mostra o mesmo par
(`debug-leftovers version-bump-no-release`) repetido em todas as últimas entradas
(`.git/proofgate-ledger.jsonl`).

#### 26.9.18 — `75-machine-paths` · caminho de máquina local (⚠️)

Padrão (`.proofgate/guards.d/75-machine-paths.sh:10`):

```
/home/[a-z_][a-z0-9_-]*/|/Users/[^/[:space:]"']+/|[A-Z]:\\Users\\
```

Lista de manutenção — caminhos de contêiner que são legítimos e nunca marcados (`:11`):

```
/home/(node|app|runner|deploy|user|ubuntu|vscode|www-data)/
```

Exclusões de caminho (`:17`): `*.md`, `*Dockerfile*`, `*.github/*`, `*.gitlab-ci*`.

Cicatriz: "`/home/alice/project/...` ou `/Users/bob/...` ou `C:\Users\...` cravado no
código ou na config funciona em exatamente um laptop e quebra no CI, no contêiner e
para todo colega" (`:3-5`).

Mensagem: `"machine-paths: N added line(s) hard-code a local machine path (/home/<you>, /Users/<you>, C:\Users\). It works on one box only — use a relative path or an env var."`

#### 26.9.19 — `85-float-money` · dinheiro em ponto flutuante (⚠️)

Exige **dois** casamentos na mesma linha (`.proofgate/guards.d/85-float-money.sh:18-19`):
primeiro uma palavra de dinheiro (case-insensitive), depois uma construção de float
(case-sensitive).

Palavras padrão (`:12`, configurável por `.moneyTerms`):

```
price|amount|total|balance|money|currency|cents|salary|payment|invoice|refund|fee|cost
```

Construções de float (`:13`):

```
parseFloat[[:space:]]*\(
\.toFixed[[:space:]]*\(
(^|[^[:alnum:]_])float[[:space:]]*\(
:[[:space:]]*float\b
\bf32\b
\bf64\b
(^|[^[:alnum:]_])double[[:space:]]+[[:alnum:]_]*(price|amount|total|balance|money|cost|fee)
```

Exclusões: `*.md`, `*test*`, `*spec*`.

Autoconsciência de ruído, escrita no arquivo (`:6-8`): "este é o guard mais barulhento
por projeto (`.toFixed` para EXIBIÇÃO é aceitável) — sempre ⚠️, nunca ❌, e
`moneyTerms` no `proofgate.json` afina o vocabulário".

Cicatriz: "`price = parseFloat(...)` / `total: float` / `amount.toFixed(2)` como fonte
de verdade significa `0.1 + 0.2 = 0.30000000000000004` na fatura de alguém, e uma
deriva de arredondamento que 'perde' um centavo por transação até o livro-razão não
fechar. Dinheiro tem que ser inteiro na menor unidade (centavos)" (`:3-6`). É o guard
que espelha, no portão, a fundação `Cents`/`Rate` do projeto.

Mensagem: `"float-money: N added line(s) put money through a float (parseFloat/.toFixed/float/double next to a money word). Store and compute money as integer cents — floats lose pennies. (Display formatting is fine; suppress with proofgate-allow if so.)"`

#### 26.9.20 — `90-sql-concat` · SQL montado por concatenação (⚠️)

Filtra primeiro pelo **verbo SQL** (`.proofgate/guards.d/90-sql-concat.sh:11`, aplicado
case-insensitive):

```
SELECT[[:space:]].*[[:space:]]FROM[[:space:]]|INSERT[[:space:]]+INTO[[:space:]]|UPDATE[[:space:]].*[[:space:]]SET[[:space:]]|DELETE[[:space:]]+FROM[[:space:]]
```

Depois, na linha, exige concatenação/interpolação (`:12`):

```
["'`][[:space:]]*\+|\+[[:space:]]*["'`]|\$\{|%s|%d|(^|[^[:alnum:]_])f["']|\.format[[:space:]]*\(
```

Duas correções finas, documentadas no próprio arquivo:

- **A fronteira antes do `f`** (`:13-15`): "sem ela, qualquer palavra terminada em `f`
  antes de uma aspa casa, e hexadecimal é cheio delas: uma linha inserindo o uuid
  `...00000000000f` avisava, porque `f'` está no dado."
- **O `||` do SQL só fora do shell** (`:17-22,29-32`): o padrão
  `["'][[:space:]]*\|\||\|\|[[:space:]]*["']` só é consultado quando o arquivo **não**
  é `*.sh|*.bash|*.zsh|*.bats` — "num script de shell `||` é *ou*, e
  `psql -c "insert into t ...;" || fail` tem exatamente a forma de `'abc' || col`.
  Nada na linha os distingue, então o tipo do arquivo distingue."

Escape embutido: template tag `` sql` `` é sempre considerada segura (`:33`).
Exclusões: `*.md`, `*test*`, `*spec*`.

Por que é sempre ⚠️: "taxa média de falso positivo (ORMs, query builders, templates
`sql` tageados)" (`:5-7`).

Mensagem: `"sql-concat: N added line(s) build SQL by string concat/interpolation — an injection risk. Use parameterized/bound queries. (Query-builder false positive? suppress with proofgate-allow.)"`

#### 26.9.21 — `92-superuser-verification` · verificação como superusuário (⚠️)

Só roda se o repositório usar RLS:
`git grep -qiE 'create policy|enable row level security'` (excluindo `*/.proofgate/*`);
senão sai com `"✅ superuser-verification: no row level security in repo — guard skipped"`
(`.proofgate/guards.d/92-superuser-verification.sh:19-20`). **Neste repositório o guard
roda de verdade** — há políticas RLS.

Padrão (`:22`):

```
-U[[:space:]]*postgres|PGUSER=postgres|psql[[:space:]]+(-[^[:space:]]+[[:space:]]+)*postgres[[:space:]]|user:[[:space:]]*.postgres.|set[[:space:]]+role[[:space:]]+postgres
```

Só busca em caminhos de verificação — os pathspecs são **positivos**, não exclusões
(`:39`): `*test* *spec* *verify* *e2e* *fixture* *harness*`.

Linhas de comentário são ignoradas (`:27`): `^[[:space:]]*(#|//|--|\*[[:space:]])`.

**Cicatriz** (`:5-11`): "um harness de esquema reproduziu toda a fila de escrita do
cliente contra um Postgres real e passou — quarenta e cinco escritas, nenhuma recusa.
Ele conectava como `postgres`. Um superusuário **contorna a RLS por completo**, então
toda política estava desligada. A execução provou que as colunas concordavam e
absolutamente nada sobre se o servidor aceitaria as escritas; a única regra que
decidia a funcionalidade nunca foi executada. Uma premissa errada então sobreviveu a
uma barra verde inteira e virou fundação."

**Duas cicatrizes secundárias do próprio guard, escritas nele:**

- "Prosa descrevendo o pecado não é o pecado. A explicação deste guard sobre por que
  `-U postgres` é errado disparou ele na primeira execução — e um guard que marca o
  comentário que alerta contra a coisa ensina as pessoas a parar de escrever o
  comentário" (`:24-26`).
- "`--` não é decoração: `$SUPER` começa com `-U`, e sem ele o `grep` lê o padrão como
  uma opção e casa silenciosamente nada. **O guard passava tudo**" (`:29-30`).

Mensagem: `"superuser-verification: N added line(s) let a test/verification path connect to Postgres as a superuser. Superusers bypass RLS, so policies are NOT exercised — the run proves shape, not acceptance. Have the part that imitates the client connect as the client's role."`

#### 26.9.22 — `95-schema-constraint-no-migration` · constraint sem migração (⚠️)

Constraint sendo adicionada (`.proofgate/guards.d/95-schema-constraint-no-migration.sh:20`,
casado case-insensitive):

```
(^|[[:space:],(])(check[[:space:]]*\(|unique[[:space:]]*\(|not[[:space:]]+null|references[[:space:]]|foreign[[:space:]]+key)
```

Só em arquivos que pareçam esquema (`:27-30`): `*.sql`, `*.ddl`, `*schema*`,
`*migration*`. E só quando o diff **daquele arquivo** contiver
`create table if not exists` (case-insensitive, `:33`) — "uma tabela novinha é
tranquila: nada existe ainda, então o CREATE TABLE carrega a constraint. Só o bloco de
criação de uma tabela EXISTENTE é a armadilha, e `if not exists` é a marca dela"
(`:31-32`).

Evidência de migração que absolve a entrega (`:22,42`):
`alter[[:space:]]+table|add[[:space:]]+constraint|migrat|__migration` em qualquer linha
adicionada do diff inteiro. "Só conta como migrado se a MESMA entrega embarcar o ALTER"
(`:41`).

**Cicatriz** (`:3-9`): "o domínio de uma coluna foi apertado com
`check (sex in ('M','F'))` dentro de um `create table if not exists`, os arquivos de
esquema foram declarados convergentes, e todos os portões ficaram verdes — paridade de
esquema, tipos gerados, tudo. **A constraint não protegia nada**: em qualquer banco que
já tivesse a tabela (produção, todo tenant, todo restore) o `if not exists` é no-op,
então a DDL nunca rodou. O dado ruim que causou a cicatriz teria sido aceito de novo.
Uma constraint só chega a um banco vivo por uma MIGRAÇÃO."

Por que ⚠️ e não ❌ (`:11-13`): "migrações vivem em lugares muito diferentes por projeto
(um diretório `migrations/`, uma lista de ALTER no código, a DSL de um framework), então
isso não dá para decidir com certeza — pergunta em vez de bloquear a entrega."

Mensagem, três linhas (`:47-49`):

```
⚠️  schema-constraint-no-migration: N constraint line(s) added inside a `create table if not exists` with NO migration in this diff —<arquivos>
    On a database that already has the table, `if not exists` is a no-op: the constraint never runs, and every schema check still goes green.
    Ship the matching `alter table ... add constraint` (guarded so it is idempotent), or suppress with proofgate-allow if this table is genuinely new.
```

#### 26.9.23 — `96-version-bump-no-release` · versão subiu, release não saiu (⚠️)

Manifestos cuja `version` é o número que um usuário lê
(`.proofgate/guards.d/96-version-bump-no-release.sh:31`):

```
(^|/)(package\.json|plugin\.json|marketplace\.json|Cargo\.toml|pyproject\.toml|composer\.json|\.csproj|gemspec|build\.gradle(\.kts)?|pubspec\.yaml|app\.json)$
```

Linha de versão adicionada (`:41`, sobre `git diff -U0`):

```
"?version"?[[:space:]]*[:=][[:space:]]*"?[0-9]+\.[0-9]+
```

**Dois modos de silêncio legítimo:**

1. automação de release na própria entrega (`:53`):
   `(release-please|changesets?/|\.changeset/|semantic-release|goreleaser)`
   → `"✅ version-release: release automation is part of this delivery"`;
2. a entrega fia o passo de release (`:57-59`): um caminho de `.github/workflows/` /
   `.gitlab-ci` / `Jenkinsfile` / `azure-pipelines` **e** uma linha adicionada em
   `*.yml|*.yaml|Jenkinsfile` casando
   `(tags:|refs/tags|create.?release|softprops/action-gh-release|gh release)`
   → `"✅ version-release: this delivery wires the release step"`.

**Explicitamente não basta**: um CHANGELOG. "Uma entrada de changelog é documentação,
não publicação, que é exatamente a confusão" (`:51-52`).

**Cicatriz datada (2026-07-30)** (`:5-9`): "uma versão foi para 2.2.0 nos manifestos do
plugin, o CHANGELOG ganhou sua seção, o PR mergeou verde, e a entrega foi reportada
como 'merged, público'. O dono abriu o repositório e viu **2.0.0**. As duas afirmações
eram verdadeiras e só uma importava: o código estava no branch default, e nenhuma tag ou
release jamais tinha sido cortada para 2.1.0 nem 2.2.0. **Uma subida de versão é
invisível para todo mundo que não está lendo o diff — o release É a vitrine.**" E a
generalização (`:11-14`): "'merged' e 'released' são eventos diferentes, e uma subida de
manifesto parece exatamente o segundo sendo apenas o primeiro. É a mesma forma de 'o
deploy está PRONTO' ou 'o OTA foi buildado' — um passo que PARECE terminal e não é."

Mensagem, cinco linhas (`:64-68`):

```
⚠️  version bumped, no release in sight:<arquivos>
    A manifest bump is not a release — nobody outside the diff can see it. Before
    calling this shipped, check the tag and the release entry EXIST for the new
    version (`git ls-remote --tags`, the repo's releases page). If cutting it is
    someone else's step, say the delivery is PENDING that step — not published.
```

Quatro saídas de curto-circuito antes de qualquer análise: diff vazio (`:28`), nenhum
manifesto de versão no diff (`:33`), nenhum número de versão levantado (`:47`), e os
dois modos de release acima.

**Estado neste repositório: dispara hoje**, em `app.json`
(`.git/proofgate-verdict.json`).

#### 26.9.24 — `97-migration-edited` · migração editada em vez de acrescentada (⚠️)

Olha `git diff --name-status` e só considera status `M*`, `D*`, `R*` — "acrescentar
arquivos aqui é normal e não é marcado. Só a modificação de um arquivo que já existia
na base é, e a remoção de um" (`.proofgate/guards.d/97-migration-edited.sh:10-11,19`).

Caminhos considerados migração (`:24`):

```
migrations/*  ·  */migrations/*  ·  db/migrate/*  ·  */db/migrate/*
*/alembic/versions/*  ·  db/schema.rb  ·  */db/schema.rb
```

Exclui `*.md`, `*.txt`, `*README*` (`:27`).

**Decisão de precisão escrita no arquivo** (`:20-22`): "**o DIRETÓRIO, não a palavra**:
`scripts/verify-migrations.sh` verifica migrações, ele não é uma — e um guard que não
distingue os dois é desligado pela primeira pessoa que ele irrita."

Cicatriz: "migrações são append-only por um motivo que não tem contorno. Um passo que já
rodou em algum lugar deixa aquele banco na forma que o texto ANTIGO produziu. Editar o
arquivo muda o que um banco NOVO recebe e nada mais — então os dois divergem, em
silêncio, e todo checkout fica bem. Isso aparece meses depois como uma coluna que existe
numa máquina e não em outra" (`:3-8`). É o mesmo princípio da regra de git do
`CLAUDE.md`: "Migração é append-only: `supabase/migrations/` e o `MIGRATIONS` de
`src/data/db.ts` só crescem."

As migrações deste projeto vivem em `supabase/migrations/`, que casa `*/migrations/*` —
o guard cobre o caso real.

Detalhe de implementação: a impressão digital deste guard usa o **status** como
conteúdo (`pg_fingerprint migration-edited "$file" "$status"`, `:28`), não a linha —
então uma supressão em `.proofgateignore` valeria por arquivo+status, não por linha.

Mensagem: `"migration-edited: N existing migration file(s) modified or removed —<arquivos>. A step that already ran leaves that database in the OLD shape while a fresh one gets the new: they diverge silently. Append a new step instead."`

#### 26.9.25 — `99-dead-allow` · marcador que não suprime nada (⚠️)

Padrão de comentário (`.proofgate/guards.d/99-dead-allow.sh:21`):

```
^[[:space:]]*(//|#|--|\*[[:space:]]|/\*|<!--)
```

O `\*` exige o espaço de JSDoc depois, "ou **negrito** de markdown no começo da linha
casa" (`:20`).

Pipeline exato (`:26-28`):

```
git diff BASE..HEAD -- . ':(exclude)*.md' PG_SELF_EXCLUDE
  | grep -E '^\+' | grep -v '^+++' | grep -F 'proofgate-allow'
  | sed 's/^+//' | grep -Ec "$COMMENT"
```

**É a cicatriz do próprio portão** (`:4-14`): "o marcador é casado contra a LINHA
ADICIONADA em si (`if (l !~ /proofgate-allow/)` no `lib.sh`). Escrito na linha de
comentário acima do código que pretende desculpar, ele não faz absolutamente nada —
enquanto lê exatamente como um achado tratado. O autor segue em frente, o aviso continua
contando, e ninguém olha porque o resumo só mostra um número. Isso é pior que um aviso
injustificado: é uma placa de 'resolvido' ligada a nada. **Mesma família de um teste
verde que não exercita regra nenhuma.**"

A regra que ele impõe: "ponha o marcador na linha infratora; deixe a explicação no
comentário, onde ela pertence" (`:13-14`).

O `CLAUDE.md` registra a mesma coisa como diretriz de manutenção do ferramental: "Vale
para o que a ferramenta erra sobre si mesma: o `dead-allow` nasceu de um marcador dela
que não suprimia nada."

Mensagem: `"dead-allow: N added comment line(s) carry proofgate-allow, which only works on the offending line itself — those suppress nothing while reading as if they do. Move the marker onto the flagged line."`

### 26.10 A biblioteca: primitivas que todo guard usa

| Função | Assinatura | O que faz |
|---|---|---|
| `cfg` | `cfg <jq-path>` | escalar cru, ou JSON compacto para objeto/array; vazio se ausente (`lib.sh:49-55`) |
| `cfg_len` | `cfg_len <jq-path-array>` | contagem de elementos, `0` se ausente ou não-array (`lib.sh:58-67`) |
| `cfg_list` | `cfg_list <jq-path-array>` | um escalar por linha (objetos como JSON compacto) (`lib.sh:70-81`) |
| `pg_json_escape` | `pg_json_escape <string>` | escapa para JSON, **barra invertida PRIMEIRO**, depois aspa, `\n`, `\r`, `\t`, e remove controles com `tr -d '\000-\010\013\014\016-\037'` (`lib.sh:85-90`) |
| `pg_fingerprint` | `pg_fingerprint <guard> <file> <content>` | `guard:file:hash12` (`lib.sh:96-102`) |
| `pg_ignored` | `pg_ignored <fingerprint>` | 0 se estiver no `.proofgateignore` (`lib.sh:110-114`) |
| `pg_added_with_file` | `pg_added_with_file [pathspecs…]` | fluxo `<arquivo>\t<linha adicionada>` de `BASE..HEAD`, menos autoexclusão e menos `proofgate-allow` (`lib.sh:126-132`) |
| `pg_match` | `pg_match <ERE> [-i]` | mantém os registros cujo **CONTEÚDO** casa, com um grep só (`lib.sh:149-161`) |
| `pg_tmpfile` | `pg_tmpfile <tag>` | temp em `${TMPDIR:-/tmp}/proofgate-<tag>.XXXXXX` (`lib.sh:164-168`) |
| `pg_scan` | `pg_scan <guard> <ERE> [pathspecs…]` | imprime o arquivo de cada linha achada, já filtrada por tudo acima (`lib.sh:173-184`) |
| `pg_count` | `pg_count` (stdin) | conta linhas não vazias (`lib.sh:189`) |

`pg_scan` é a redução do guard médio a uma linha: "guards se reduzem a: conte as linhas
que isto imprime" (`lib.sh:170-172`).

Quatro detalhes que são cicatriz e não estilo:

- **`pg_match` existe por medição.** "Num branch com **31.182 linhas adicionadas**, todo
  guard de diff abria dois processos por linha e o portão levava oito minutos — mais de
  um milhão de forks para uma execução cujo trabalho real é um punhado de casamentos de
  regex. Os guards estavam sendo cobrados por partida de processo, não por varredura"
  (`.proofgate/lib.sh:137-140`). Os números do antes/depois estão no `CLAUDE.md`: o
  portão da proofgate saiu de ~8 min para **22 s**.
- **Por que não mover o casamento para dentro do `awk`**, que dispensaria o arquivo
  temporário: "os padrões dos guards são EREs de GNU grep e vários usam `\b`, que o awk
  POSIX não conhece e o mawk não suporta de jeito nenhum. Traduzi-los mudaria o que um
  guard casa — **e um guard que silenciosamente para de casar é pior que um lento**.
  Então a ERE fica no grep, exatamente como escrita, e só a COLUNA DE CONTEÚDO é
  alimentada nele" (`lib.sh:142-148`).
- **`cut -f2-`, não `cut -f2`** (`lib.sh:154-155`): "mantém tudo depois do PRIMEIRO tab:
  uma linha de diff pode ter tabs próprios, e dividir em todos truncaria o conteúdo."
- **`pg_count` não usa `grep -c` direto** (`lib.sh:187-188`): "`grep -c` imprime 0 E sai
  1 quando não casa, então capturamos o stdout em vez de confiar no status de saída (um
  `grep -c . || echo 0` ingênuo imprime `0\n0`)."

Três guards ainda mantêm laço próprio depois do `pg_match`, e cada um diz por quê: as
decisões que dependem do **tipo do arquivo** (`90-sql-concat:24-27`), a exclusão de
comentário (`92-superuser-verification:33-34`), e a filtragem por caminho de teste
(`58-frozen-clock:15-16`).

### 26.11 O veredito e o livro-caixa

Escritos apenas em execução completa — **nunca** com `--only` ou `--dry-run`
(`.proofgate/verify.sh:300`).

**Veredito**: `$(git rev-parse --git-dir)/proofgate-verdict.json`, isto é
`.git/proofgate-verdict.json` — "dentro do `.git`, então nunca é commitado"
(`.proofgate/verify.sh:18-21`). Escrita atômica: `mktemp` no mesmo diretório e `mv`
(`.proofgate/verify.sh:306-307`).

Forma exata (`.proofgate/verify.sh:304`):

```json
{
  "schemaVersion": 1,
  "sha": "<git rev-parse HEAD>",
  "generatedAt": "<date -u +%Y-%m-%dT%H:%M:%SZ>",
  "flags": { "build": false, "strict": false, "smoke": false },
  "checks": [ { "name": "...", "status": "pass|warn|fail|note", "detail": "..." } ],
  "fails": 0,
  "warns": 3,
  "pass": true
}
```

`pass` é `false` se `FAILS > 0`, senão `true` (`.proofgate/verify.sh:297`). Ou seja:
**avisos não derrubam `pass`** (salvo sob `--strict`, que os soma em `FAILS` antes).

**Livro-caixa**: `.git/proofgate-ledger.jsonl`, append-only, **só quando houve falha ou
aviso** (`.proofgate/verify.sh:308-311`):

```
{"sha":"…","ts":"…","fails":N,"warns":N,"fired":"<nomes dos guards separados por espaço>"}
```

`FIRED` acumula só nomes de **guards** que saíram 1 ou 2 (`.proofgate/verify.sh:260-261`)
— os checks do motor (como `git-pushed`) contam para `warns` mas não entram em `fired`.
Isso explica a assimetria visível hoje:
`{"fails":0,"warns":3,"fired":"debug-leftovers version-bump-no-release"}` — o terceiro
aviso é o `git-pushed`.

Estado medido: 188 linhas no livro-caixa (`wc -l .git/proofgate-ledger.jsonl`), e as
últimas oito entradas trazem o mesmo par de guards.

> Ponto morto encontrado: `.gitignore:47` ignora `.proofgate/verdict.json`, um caminho
> que **nenhuma versão deste código escreve** — o veredito vai para
> `.git/proofgate-verdict.json`. A entrada é vestigial.

**Anotações do GitHub Actions** (`.proofgate/verify.sh:66-70`): quando `GITHUB_ACTIONS`
está setada e não se está em `--json`, cada `warn`/`fail` também emite
`::warning ::<msg>` / `::error ::<msg>`, com `%`, CR e LF escapados como `%25`, `%0D`,
`%0A`.

**Resumo do job** (`.proofgate/verify.sh:317-325`): se `GITHUB_STEP_SUMMARY` existir,
anexa `## ProofGate — ❌ FAILED` ou `## ProofGate — ✅ passed`, a contagem
`` `N` failure(s) · `M` warning(s) ``, e o log inteiro num bloco de código.

**Relatório `--report`** (`.proofgate/verify.sh:327-330`): escreve
`# ProofGate report — <timestamp>` seguido do log num bloco, e imprime
`report written: <arquivo>` (salvo em `--json`).

### 26.12 O push-guard

Arquivo: `.proofgate/hooks/push-guard.sh`. Instalado em `.claude/settings.json` como
`PreToolUse` com `matcher: "Bash"`, comando `bash .proofgate/hooks/push-guard.sh`.

**Por que um hook de PreToolUse e não um hook `pre-push` do git**, transcrito (`:5-9`):
"o adversário aqui é o AGENTE, e um hook `pre-push` do git é pulado trivialmente com
`git push --no-verify` (um modo de falha real e reportado — anthropics/claude-code#40117).
Este hook vê o comando CRU que o agente está prestes a rodar, ANTES do git, então
`--no-verify` não consegue passar o push por ele — e a tentativa de bypass é sinalizada
explicitamente."

O `CLAUDE.md` registra o erro humano que o originou: "Duas vezes num dia eu empurrei
antes de ler a saída da barra — uma com o shellcheck vermelho, outra com uma mutação
sobrevivente que o CI pegou logo depois. Isso não se conserta com atenção." O relato
longo está em `docs/insights.md:880-899`, e termina com a prova nos dois sentidos:
"veredito no HEAD libera, HEAD adiantado recusa com saída 2".

**Contrato**: lê o JSON do evento em stdin; `exit 0` permite; `exit 2` bloqueia e devolve
o stderr ao agente. "É FAIL-OPEN por construção: qualquer erro de parse, ferramenta
faltando ou estado inesperado termina em `exit 0` — um guard quebrado nunca pode travar
o agente" (`:11-14`).

**Sequência exata:**

| Passo | Linhas | O que faz |
|---|---|---|
| 0 | `:23-24` | pré-filtro barato: se o payload não contém a substring `push`, sai 0. `PROOFGATE_HOOK_OFF=1` sai 0. "Este hook dispara em TODA chamada Bash; o caminho comum são dois builtins e fora." |
| 1 | `:30-41` | extrai `.tool_input.command` com `jq` → `python3` → `node`; sem nenhum parser, sai 0; comando vazio, sai 0 |
| 2 | `:44` | é mesmo um `git push`? Regex: `(^\|[;&\|[:space:](])git([[:space:]]+-[-[:alnum:]=]+)*[[:space:]]+push([[:space:]]\|$)` — aceita flags globais do git antes do `push` |
| 3 | `:47-54` | opt-in: só guarda repositório que adotou o ProofGate (`proofgate.json` **ou** diretório `.proofgate`). Procura o `lib.sh` em `skills/proofgate/scripts/lib.sh`, senão `.proofgate/lib.sh`. Se `.pushGuard` for a string `false`, sai 0 |
| 4 | `:57-60` | **anti-bypass**: se o comando casar `--no-verify\|core\.hooksPath`, bloqueia com `exit 2` |
| 5 | `:63-71` | **frescor**: lê `$(git rev-parse --git-dir)/proofgate-verdict.json`, extrai o sha com `sed -n 's/.*"sha":"\([0-9a-f]\{7,40\}\)".*/\1/p'` (primeiro casamento), e libera **só se** `sha == HEAD` **e** o arquivo contiver a string `"pass":true` |
| 6 | `:74-76` | bloqueia com `exit 2` e uma razão acionável |

Mensagens (decisões de produto, transcritas):

- bypass (`:58`): `"ProofGate: push blocked — this command tries to bypass verification (--no-verify / core.hooksPath). Run the gate and push cleanly, or set pushGuard:false in proofgate.json if you truly mean to."`
- sem veredito fresco (`:75`): `"ProofGate: push blocked — no fresh passing verdict for HEAD <7 chars>. Run \`bash .proofgate/verify.sh\` (it must pass), then push. Bypass: pushGuard:false in proofgate.json, or PROOFGATE_HOOK_OFF=1."`
  O nome do comando é escolhido em `:74`: `GATE="bash .proofgate/verify.sh"` se o arquivo
  existir, senão `"the ProofGate skill / verify.sh"`.

**Como se desliga**, os dois caminhos (`:16`): `PROOFGATE_HOOK_OFF=1` no ambiente, ou
`"pushGuard": false` no `proofgate.json`. O `CLAUDE.md` repete os dois.

**Defeito verificado nesta cópia — a razão nunca chega a quem foi bloqueado.** O bloco
inteiro dos passos 1 a 6 termina em `} 2>/dev/null || exit 0`
(`.proofgate/hooks/push-guard.sh:77`), o que redireciona o **stderr do bloco todo** para
`/dev/null` — incluindo os dois `echo … >&2` dos passos 4 e 6.

Medido três vezes nesta sessão:

1. `echo '{"tool_input":{"command":"git push --no-verify"}}' | bash .proofgate/hooks/push-guard.sh`
   → sai **2**, stderr **vazio**;
2. o mesmo com um veredito cujo `sha` foi trocado por outro → sai **2**, stderr vazio;
3. o hook real, disparado por uma chamada de Bash desta sessão cujo texto continha a
   string `git push` (o próprio comando que escreveria este capítulo): o agente recebeu
   literalmente `PreToolUse:Bash hook error: [bash .proofgate/hooks/push-guard.sh]: No stderr output`.

Ou seja: **o portão bloqueia corretamente, e o pré-filtro por substring é largo o
bastante para pegar qualquer comando que apenas mencione `git push` em texto** — mas a
mensagem que explicaria o bloqueio é engolida. Isso NÃO ESTÁ CORRIGIDO no código atual.

Também verificado: com o veredito atual (`sha == HEAD`, `"pass":true`), um
`git push origin HEAD` passa com código 0.

### 26.13 Níveis de evidência E0..E4

Definição transcrita literalmente de `.proofgate/templates/evidence-report.md:19-21`:

> Evidence level: **E0** believed · **E1** static (typecheck/lint) · **E2** automated
> test · **E3** exercised end-to-end on the real runtime · **E4** observed in
> production. A runtime claim is DONE only at **E3+**.

Em português, com os exemplos que o próprio modelo dá (`:25-27`):

| Nível | Significado | Exemplo de afirmação | Evidência que a sustenta |
|---|---|---|---|
| **E0** | acreditado | — | nenhuma; é a ausência de prova |
| **E1** | estático (typecheck/lint) | — | saída do compilador / linter |
| **E2** | teste automatizado | "o reducer trata o caso vazio" | nome do teste + linha de aprovação |
| **E3** | exercitado ponta a ponta no runtime real | "o fluxo de checkout funciona" | URL da execução e2e / captura de tela revisada |
| **E4** | observado em produção | "POST /api/orders devolve 201 em produção" | saída do `curl` / link de log de produção |

**A regra de corte**: uma afirmação sobre runtime só é DONE em **E3 ou acima**.

O `CLAUDE.md` incorpora a escala como portão de julgamento pós-proofgate: "Depois dele
vem o portão de julgamento: diga em que nível a afirmação central se sustenta (E0
acreditado → E3 exercitado de verdade → E4 visto em produção), com o comando que provou.
'Compilou' não é 'funciona'."

> O que NÃO existe: o mapeamento entre os passos do `verify.sh` e os níveis. O motor não
> emite nível de evidência, não calcula `max_achievable_level` e não lê nenhuma chave de
> config relacionada. **A escala é usada por pessoas preenchendo o modelo, não pelo
> script.**

### 26.14 Os dois modelos

#### 26.14.1 `evidence-report.md` — o relatório de evidência

45 linhas. Instrução de uso no topo (`:3-5`): "Cole este bloco preenchido na descrição do
seu PR ou no relato de status. Regra: toda afirmação precisa de um comando que rodou, um
link, ou um número. **Uma seção VERIFIED vazia significa que a entrega não existe
ainda.**"

Seções, na ordem:

| Seção | Conteúdo exigido |
|---|---|
| `## Mechanical gate` | bloco de código com o rabo da saída do `verify.sh` — as linhas ✅/⚠️/❌ e o veredito |
| Justificativa dos ⚠️ | uma linha por aviso: `` - ⚠️ `<warning>` → <por que é aceitável AQUI, ou a issue que rastreia> ``. Rotulada `(mandatory — silence is not a justification)` |
| `## VERIFIED (exercised for real)` | tabela `Claim \| Level \| Evidence`, precedida da definição E0..E4 |
| `## NOT TESTED (honest list)` | tabela `What \| Why not \| How/when it will be verified` |
| `## PARTIAL / KNOWN GAPS` | o que falta de propósito e onde está rastreado |
| `## Root cause (bugfix deliveries only)` | link para o `root-cause.md` preenchido |
| `## Lesson recorded` | teste de regressão / guard novo em `guards.d/` / entrada de known-issues — **ou** "none, nothing caught" |

A última seção é o gancho formal da diretriz do `CLAUDE.md` de que erro que vira padrão
vira guard no repositório da proofgate.

#### 26.14.2 `root-cause.md` — a análise de causa raiz

73 linhas. Instrução de uso (`:3-5`): "Preencha ANTES de escrever a correção. Um
'conserto plausível' no escuro é proibido: se você não consegue apontar para evidência,
você ainda não achou a causa."

| Seção | O que pede |
|---|---|
| `## 1. Symptom` | o que usuário/sistema observou, **verbatim** (texto de erro, captura, link do evento) |
| `## 2. Layer` | caixas de seleção: Frontend (JS/rendering) · Backend (API/domain logic) · Native (mobile platform / OS API) · Data (schema/migration/query) · Infra (env/config/deploy/network). "Escolha uma — e prove. Um try/catch numa camada não pega um crash em outra." Mais o campo `Proof of layer:` (linha de stack trace / fonte do log / repro que isola a camada) |
| `## 3. Root cause` | o mecanismo real, um parágrafo, com referências `arquivo:linha` |
| `### 3b. The hypothesis, made falsifiable` | "Observar um EFEITO não é identificar um AGENTE." Tabela de quatro linhas: **Hypothesis** (o mecanismo, uma frase) · **Prediction** — se verdadeira, o que DEVE existir? (uma linha de log, um processo, uma entrada de reflog, uma métrica, um frame de pilha) · **Command** que revela isso · **What it actually printed**. Duas caixas: marca presente → a hipótese sobrevive; marca ausente → **a hipótese está morta. Substitua, não remende** |
| `## 4. Evidence` | link do rastreador de erro / trecho de log / teste falhando / resultado de query |
| `## 5. Why it wasn't caught earlier` | teste faltando? guard faltando? issue conhecida ignorada? modo de falha novo? |
| `## 6. The fix` | o que muda e por que isso mata a CAUSA, não o sintoma |
| `## 6b. Counter-proof` | "o que você esperaria ver se esta correção estivesse ERRADA (o sintoma ainda disparando, um erro diferente, o valor errado)? Você checou que esse sinal agora está AUSENTE? **Uma correção que você só confirmou pela ausência do erro do caminho feliz não está provada**" |
| `## 7. Regression pin` | teste/guard adicionado para que esta falha exata nunca mais possa passar em silêncio |
| `## 8. Strike counter` | "Esta é a 2ª+ tentativa no mesmo bug? Se sim: que ABORDAGEM mudou desta vez? (**Martelar a mesma estratégia uma terceira vez é proibido.**)" |

A regra mais forte do arquivo é sobre causa externa (`:42-46`): "Se a causa é EXTERNA
(infra, plataforma, um terceiro, 'está flaky'), a barra SOBE, não desce: nada contradiz
um culpado ausente, então ele nunca é refutado e endurece em folclore que decisões
futuras orbitam. Sem artefato que nomeie o agente, escreva **'efeito observado; causa
desconhecida'** mais o comando que vai medir isso da próxima vez — uma pergunta aberta
ganha de uma resposta errada e confortável."

**Estado dos dois modelos: presentes e nunca preenchidos dentro do repositório.** Não
existe nenhum arquivo derivado deles em `docs/` nem em qualquer outro lugar da árvore.
São referência, não artefato.

### 26.15 Como escrever um guard novo

O molde é `.proofgate/guards.d/TEMPLATE.sh.example` (38 linhas). Passos, na ordem:

1. Renomear para `NN-nome.sh` — `NN` ordena a execução, e o nome sem o prefixo é o que
   `--only`, `skip` e `severity` usam (`:13`).
2. Sourcear a biblioteca:
   `. "${PROOFGATE_LIB:-$(dirname "$0")/../lib.sh}" 2>/dev/null || true` (`:22`).
3. Ler a base: `BASE="${PROOFGATE_BASE:?}"` (`:23`).
4. Contar achados: `n="$(pg_scan my-guard 'PADRÃO' | pg_count)"` (`:27`).
5. Sair 0 / 1 / 2 imprimindo **uma** linha ✅/⚠️/❌ (`:29-33`).

As duas convenções obrigatórias (`:15-19`): terminar as linhas que carregam padrão com um
comentário `proofgate-allow`, e excluir os arquivos do portão com `"${PG_SELF_EXCLUDE[@]}"`
— "ou simplesmente usar `pg_scan`, que aplica as duas coisas E a supressão por achado do
`.proofgateignore`".

E o caminho sem a biblioteca, para portabilidade total (`:36-38`):

```bash
HITS=$(git diff "$BASE"..HEAD | grep -E '^\+' | grep -Ec 'SEU_PADRÃO')
[ "${HITS:-0}" -gt 0 ] && { echo "⚠️ ..."; exit 2; }; echo "✅ ..."; exit 0
```

O `CLAUDE.md` acrescenta a regra de governança que o molde não tem: "A proofgate cresce
com o uso — é diretriz, não cortesia. Toda vez que um erro aqui vira um padrão que um
script pegaria, ele vira guard no repositório dela (`ChrnX0/proofgate`), **com teste
positivo e negativo**, e sobe por PR. Conselho eu esqueço na próxima sessão; guard roda
sozinho."

### 26.16 Estado consolidado

| Item | Estado |
|---|---|
| `verify.sh` completo | **implementado e chamado** (barra local + `.github/workflows/ci.yml:71`) |
| 25 guards | **implementados**; 22 produzem resultado real neste diff, 2 saem cedo por falta de config/arquivo (`env-drift`, `coupled-files`), e `superuser-verification` roda de verdade porque o repositório tem políticas RLS |
| `push-guard.sh` | **implementado e instalado** em `.claude/settings.json`; bloqueia corretamente, mas **a mensagem de razão é engolida** (§26.12) |
| `--smoke` / `smoke[]` | **implementado, sem chamador** — não há config e nenhum chamador passa a flag |
| `--strict` | **implementado, sem chamador** — nem o CI nem a barra do `CLAUDE.md` usam |
| `--build` | **implementado, sem chamador** no CI; a nota "build NOT run" aparece em todo veredito |
| `--json`, `--report`, `--dry-run`, `--only`, `--base` | **implementados**; `--only` é o laço de trabalho descrito no `CLAUDE.md` |
| `proofgate.json` | **NÃO EXISTE** — todos os padrões valem |
| `.proofgateignore` | **NÃO EXISTE** — nenhuma supressão por impressão digital |
| `guardsDirs` / guards locais do projeto | **NÃO EXISTEM** — nenhum guard fora de `.proofgate/guards.d/` |
| `SKILL.md` / portão de julgamento | **NÃO ESTÁ NO CÓDIGO** (§26.2) |
| `evidence-report.md` / `root-cause.md` | **presentes, nunca preenchidos** na árvore |
| `TEMPLATE.sh.example` | **presente e inerte** — o laço só pega `*.sh` |
| `PROOFGATE_STRICT` | **exportada e nunca lida** por guard algum |
| `.gitignore:47` (`.proofgate/verdict.json`) | **caminho morto** — o veredito vai para `.git/proofgate-verdict.json` |
| Contagem de guards no comentário do CI ("Nineteen") e no `docs/insights.md:966` ("vinte e duas") | **desatualizadas**; são 25 |

Veredito medido nesta sessão (`.git/proofgate-verdict.json`, sha
`4d75ae091a45c6fe9bfde2a9a08e79e5c836435b`, gerado em `2026-09-04T22:28:21Z`):
`"fails": 0, "warns": 3, "pass": true` — os três avisos sendo `git-pushed`,
`debug-leftovers` e `version-bump-no-release`.
