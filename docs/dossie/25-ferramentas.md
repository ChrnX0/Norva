## 25. Ferramentas de verificação: mutação, e2e, capturas e folha

### 25.1 O inventário

Oito arquivos formam as ferramentas de verificação e de olhar deste repositório.
Sete têm comando declarado em `package.json`; um (`icons.mjs`) se roda à mão; um
(`manifesto.mjs`) é biblioteca, sem comando próprio.

> **Nota de honestidade sobre esta seção.** Ela foi escrita quando as ferramentas
> eram sete. O oitavo arquivo — `scripts/dossie.mjs`, que monta este documento —
> nasceu depois, e por algumas horas esta seção afirmou "sete" e transcreveu o bloco
> `scripts` do `package.json` sem a linha `dossie`. Um crítico varreu o repositório
> contra o dossiê e achou que **o único arquivo do projeto não citado em lugar nenhum
> era justamente o que explica o dossiê**. Fica registrado porque é a doença que a
> §33.5 descreve: número escrito envelhece, e nenhuma guarda cobria esta linha.

| arquivo | linhas | comando | estado |
|---|---|---|---|
| `scripts/mutate.mjs` | 1238 | `npm run mutate` | implementado, chamado pelo CI e pelo portão |
| `e2e/flow.mjs` | 2037 | `npm run e2e` | implementado, chamado pelo CI |
| `scripts/e2e-parallel.mjs` | 92 | `npm run e2e:fast` | implementado, chamado à mão e pela barra |
| `scripts/shot.mjs` | 316 | `npm run shot` | implementado, chamado à mão |
| `scripts/folha.mjs` | 72 | `npm run folha` | implementado, chamado à mão |
| `scripts/icons.mjs` | 169 | **nenhum** — `node scripts/icons.mjs` | implementado, **sem comando em `package.json`** |
| `scripts/manifesto.mjs` | 100 | **nenhum** — biblioteca | implementado, importado por três ferramentas |

O bloco `scripts` do `package.json`, transcrito por inteiro (`package.json:6-20`):

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "lint": "expo lint",
  "test": "tsx --test 'src/**/*.test.ts'",
  "db:verify": "bash scripts/verify-migrations.sh",
  "e2e": "node e2e/flow.mjs",
  "mutate": "node scripts/mutate.mjs",
  "e2e:fast": "node scripts/e2e-parallel.mjs",
  "shot": "node scripts/shot.mjs",
  "folha": "node scripts/folha.mjs"
}
```

Não existe script `icons` (`package.json:6-20`) — o `icons.mjs` documenta o próprio
uso como `node scripts/icons.mjs` (`scripts/icons.mjs:25`), e é citado como feito em
`docs/roadmap.md:325`.

As duas dependências de desenvolvimento que sustentam tudo isto: `playwright`
`^1.56.0` e `playwright-core` `^1.56.0` (`package.json:52-53`). O código de
navegador importa sempre `playwright-core` — `import { chromium } from
'playwright-core'` (`e2e/flow.mjs:6`, `scripts/shot.mjs:22`, `scripts/folha.mjs:17`).
`tsx` `^4.23.13` (`package.json:54`) é o que roda os testes de unidade, inclusive
dentro da oficina de mutação.

Duas pastas que estas ferramentas escrevem e o git ignora: `.mutate/` e `.shots/`
(`.gitignore:52-53` — eram as duas últimas linhas do arquivo até `docs/DOSSIE.md` entrar
depois delas, e localizar por posição em vez de por linha é o que fez o ponteiro envelhecer),
com o motivo escrito ali mesmo — *"As cópias que
o `mutate` usa para nunca tocar na árvore de trabalho. Ele apaga sozinho ao sair;
isto cobre a execução que morreu no meio, para o portão não reprovar por 'árvore
suja' por causa de lixo de ferramenta."*

---

### 25.2 A tabela de tempos: a espera virou medida

Transcrita de `CLAUDE.md` (seção "A barra de verificação"), com o texto que a
acompanha:

> **A espera era o gargalo, e virou medida — 3 de setembro.** A barra inteira levava
> perto de meia hora por commit, e quase tudo era partida de processo: `mutate` abria
> 64 vezes a suíte em série, o `e2e` rodava 30 checagens uma atrás da outra, e cada
> guard da proofgate abria **um `grep` por linha adicionada** (com 31 mil linhas no
> diff, mais de um milhão de processos por execução).

| | antes | depois |
|---|---|---|
| portão da proofgate | ~8 min | **22 s** |
| `mutate` (64 mutações) | 12 min | 6 min |
| `e2e` (30 checagens) | 7 min | 2 min 40 |

Duas consequências que o mesmo texto registra, palavra por palavra:

> - **`e2e:fast` exporta uma vez e fatia as checagens.** O `npm run e2e` continua
>   existindo e serve para uma checagem só (`--only`), que é o laço de trabalho.
>   Reusar `dist` **porque ele existia** já fez a suíte passar verde para uma tela que
>   não tinha a mudança — no `e2e:fast` o pacote é sempre o da execução.
> - **O `mutate` nunca mais toca a árvore de trabalho.** Ele copia o código para
>   `.mutate/` e muta a cópia. As três redes que existiam contra "deixar uma mutação
>   no disco" — `finally`, ganchos de sinal, e a checagem de árvore suja que abortava
>   a execução seguinte — eram três redes para um abismo que não precisava existir.

**A tabela é datada e os números de contagem envelheceram.** Ela fala de 64 mutações
e 30 checagens; hoje o `mutate` tem **106** entradas (`scripts/mutate.mjs`, contagem
de `file:` na lista `DEFECTS`) e o `e2e` tem **36** checagens (`e2e/flow.mjs`,
contagem de `check(`). Os tempos de coluna "depois" foram medidos com os números
antigos; **NÃO ESTÁ NO CÓDIGO** nenhuma medida nova para 106 mutações e 36 checagens.

Outros tempos declarados, cada um na sua fonte, e eles não concordam entre si:

| medida | valor | fonte |
|---|---|---|
| `expo export` (o empacotamento) | "uns dois minutos" | `scripts/e2e-parallel.mjs:5-6` |
| `expo export` (o mesmo passo) | "quatro minutos de exportação" | `e2e/flow.mjs:29-30` |
| `expo export` (na ferramenta de foto) | "perto de um minuto e meio" | `scripts/manifesto.mjs:57-58`, `scripts/shot.mjs:149` |
| 30 checagens em série | "outros cinco [minutos]" | `scripts/e2e-parallel.mjs:6-7` |
| 30 checagens em série | "cinco minutos por rodada" | `e2e/flow.mjs:47-48` |
| `mutate` em série (64) | "doze minutos de espera por commit" | `scripts/mutate.mjs` (docblock da oficina) |
| `mutate` completo | "seis minutos" | `src/bar.test.ts:31-32` |
| refazer um desenho | "dez olhadas… quinze minutos de espera para quinze segundos de conserto" | `scripts/manifesto.mjs:58-61`, `scripts/shot.mjs:149-151` |

A discrepância de dois contra quatro minutos para o mesmo `expo export` está no
código como está escrito aqui; qual das duas é a medida certa **NÃO ESTÁ NO CÓDIGO**.

---

### 25.3 `npm run mutate` — quebrar o código de propósito

`node scripts/mutate.mjs` (`package.json:16`). Estado: **implementado e chamado** —
pelo CI (`.github/workflows/ci.yml:41-42`, passo "Does the suite bite?") e contado
pela guarda de números (`src/bar.test.ts:129`).

#### 25.3.1 A pergunta que ele faz, transcrita do topo do arquivo

`scripts/mutate.mjs:2-24`:

> Asks the only question a green suite cannot answer on its own: would these tests
> still pass if the code were wrong?
>
> It breaks the code on purpose, one defect at a time, runs the suite, and puts the
> file back. A defect nobody notices is a hole in the bar, and the run fails on it.
>
> The list is curated rather than random, and that is deliberate. Blind mutation
> spends most of its time on changes nobody would ever make; this one carries the
> defects that would actually hurt in this product - money rounding the wrong way, a
> permission check that stops checking, a balance that counts instead of summing.
> Each entry is a sentence about what would go wrong in the factory if it slipped
> through.
>
> The first run of this found `Math.round` in `amountOf` could become `Math.floor`
> with ninety-two tests staying green - the project's headline rule about money held
> up by nothing but arithmetic coincidence.
>
> Add to the list whenever a defect gets fixed: the mutation is the cheapest possible
> proof that the test written alongside it actually bites.

#### 25.3.2 A história do `Math.round` → `Math.floor` que 92 testes não pegaram

A mutação que provocou isso está viva na lista, na **posição 58** (`scripts/mutate.mjs:530-535`):

```
file:  'src/domain/money.ts'
from:  'return Math.round(unitRate * quantity) as Cents;'
to:    'return Math.floor(unitRate * quantity) as Cents;'
hurts: 'todo custo sai um pouco baixo, sempre para o mesmo lado, e a margem sai alta'
```

O `CLAUDE.md` conta a mesma coisa em português, na seção da barra:

> O `mutate` existe porque suíte verde não quer dizer regra protegida: quer dizer que
> os exemplos escolhidos não a exercitam. Na primeira execução ele trocou o
> `Math.round` do `amountOf` por `Math.floor` — *o* ponto de arredondamento do
> sistema — e **noventa e dois testes continuaram verdes**. A regra da capa deste
> projeto estava sustentada por coincidência aritmética.

Duas coisas para não confundir na reconstrução: a função é `amountOf`, o arquivo é
`src/domain/money.ts`, e a linha mutada é a do arredondamento final (`Math.round(unitRate
* quantity)`). Existe uma **segunda** mutação de arredondamento no mesmo arquivo,
**posição 77** (`scripts/mutate.mjs:670-674`): `'return Math.round(value * factor) as Cents;'`
→ `'return Math.trunc(value * factor) as Cents;'`, com *dói*: "multiplicar dinheiro
passa a cortar em vez de arredondar, sempre para baixo".

#### 25.3.3 A oficina `.mutate/`: como a cópia funciona

Constantes (`scripts/mutate.mjs`, após a lista):

| constante | valor | o que é |
|---|---|---|
| `RAIZ` | `process.cwd()` | a árvore de trabalho, que nunca é escrita |
| `OFICINA` | `join(RAIZ, '.mutate')` | onde as cópias vivem |
| `TRABALHADORES` | `Math.max(1, Math.min(cpus().length, 4))` | quatro frentes no máximo |

`prepararOficina()` faz, na ordem: `rmSync(OFICINA, {recursive:true, force:true})`;
lista `readdirSync(RAIZ)` filtrando `NAO_COPIAR`; para cada trabalhador `n` de 0 a
`TRABALHADORES-1` cria `.mutate/w<n>`, copia cada alvo com `cpSync(..., {recursive:
true})`, e liga `node_modules` por link simbólico —
`symlinkSync(join(RAIZ,'node_modules'), join(dir,'node_modules'), 'dir')`.

A lista de exclusão, transcrita (`scripts/mutate.mjs`, `const NAO_COPIAR`):

```js
const NAO_COPIAR = new Set([
  'node_modules', // ligado por link simbólico logo abaixo
  '.git',
  '.mutate',
  'dist',
  '.expo',
  '.shots',
  'android',
]);
```

**Ela é lista de exclusão porque uma lista de inclusão cegou o portão por 66
commits.** O docblock guarda a cicatriz inteira: a versão de 3 de setembro dizia
`['src', 'scripts', 'package.json', 'tsconfig.json']`, escrita quando os testes só
liam `src/`. Depois disso a suíte ganhou guardas que leem o repositório — "o
dicionário varre `app/`, os seletores leem `e2e/flow.mjs`, o acordo lê
`supabase/migrations`, a tabela lê `CLAUDE.md` e `docs/roadmap.md`". Na oficina esses
arquivos não existiam, os testes morriam no carregamento com `ENOENT`, e **a suíte da
oficina saía com 19 falhas antes de qualquer mutação**. Como `pego =
!suitePasses(dir)` e `suitePasses` procurava `# fail 0`, toda mutação era declarada
pega sem a suíte ter sido consultada: "Sessenta e seis commits com 'os N defeitos
foram pegos' que não queriam dizer nada, no CI e no portão de entrega."
(`scripts/mutate.mjs`, docblock de `NAO_COPIAR`; a mesma história em
`docs/insights.md:2945` e seguintes, onde consta que o relatório dizia "os 90
defeitos foram pegos" e que, com a oficina consertada, **seis mutações
sobreviveram** — quatro buracos reais e dois equivalentes).

Limpeza: `process.on('exit', () => rmSync(OFICINA, {recursive:true, force:true}))`,
registrado imediatamente depois de `prepararOficina()`.

**A cicatriz que este desenho fecha**, transcrita do docblock:

> A versão anterior mutava o arquivo DE VERDADE e desfazia depois. Uma execução foi
> interrompida, o `finally` não rodou, e o guarda de ciclo de receita ficou desativado
> na árvore de trabalho — enquanto um build de APK começava a empacotar exatamente
> esse diretório. A resposta na época foram três redes: `finally`, ganchos de
> SIGINT/SIGTERM/SIGHUP, e uma checagem de árvore suja na entrada que ABORTAVA a
> execução seguinte.
>
> Três redes para o mesmo abismo é sinal de que o abismo não devia existir. Mutando
> cópias, o pior caso de uma morte no meio é um diretório para apagar — e a checagem
> de árvore suja, que já custou uma rodada travada ("A árvore já está suja nos
> arquivos que este script muda"), deixou de fazer sentido.

O registro original do incidente está em `docs/insights.md:998-1021` — o guarda de
ciclo de receita trocado por `if (false)` ficou no disco no momento em que um build de
APK ia empacotar aquele diretório.

#### 25.3.4 `oficinaConfere(dir)` — a oficina prova que serve antes de julgar

Roda `spawnSync('npx', ['tsx', '--test', 'src/**/*.test.ts'], {cwd: dir, encoding:
'utf8', env: {...process.env, FORCE_COLOR: '0'}})`. Se a saída contém `# fail 0`,
volta calada. Senão extrai `/^# fail (\d+)/m` (ou `'?'`), imprime no `stderr` e sai
com `process.exit(1)`. A mensagem, ao pé da letra:

```
A oficina não roda a suíte: <N> falha(s) SEM mutação nenhuma.

Enquanto isso for verdade, todo defeito plantado é declarado "pego" sem a
suíte ter sido consultada — que é o pior relatório possível: verde por
construção. Provavelmente um teste passou a ler um arquivo que a cópia não
leva; veja NAO_COPIAR.
```

Em seguida imprime até 12 linhas da saída que casem com `/^not ok|Error:/`. É chamada
uma vez, em `w0`, antes de qualquer julgamento. O docblock explica por que: *"O
relatório mais bonito que este script já imprimiu — 'os 90 defeitos foram pegos' —
foi impresso por uma oficina que não rodava a suíte."*

#### 25.3.5 `lerSuite(run)` — três resultados, não dois

```js
function lerSuite(run) {
  const saida = `${run.stdout}`;
  if (saida.includes('# fail 0')) return 'passou';
  if (/^# fail [1-9]/m.test(saida)) return 'falhou';
  return 'inconclusivo';
}
```

O docblock a chama de "a terceira aparição da mesma" cicatriz: era `return
stdout.includes('# fail 0')`, e essa linha *"diz 'pegou' para tudo o que não imprimiu
o resumo: uma execução morta por falta de memória, um `npx` que não subiu, um teste
que estourou o tempo com a máquina disputada"*. As três aparições, nomeadas: (1) a
oficina que não copiava as pastas dos testes, 66 commits; (2) a oficina declarando
"pego" sem consultar a suíte; (3) esta, em que uma execução sem resumo virou "pego" e
o relatório acusou **MARCADOR ERRADO** num marcador que estava certo — "alarme
inventado no instrumento que existe para não inventar alarme". O relato longo está em
`docs/insights.md:3234`, e a regra que sai dele: *"instrumento que só distingue dois
estados chama ausência de medida de resultado favorável"*.

#### 25.3.6 `conferirRegua()` — a régua conferida antes de medir

Quatro casos sintéticos, transcritos:

| saída sintética | leitura esperada |
|---|---|
| `# tests 300\n# pass 300\n# fail 0\n` | `passou` |
| `# tests 300\n# pass 299\n# fail 1\n` | `falhou` |
| `''` (vazio) | `inconclusivo` |
| `FATAL ERROR: Reached heap limit` | `inconclusivo` |

Se qualquer um discordar, lança:
`` a régua da suíte está quebrada: "<saída, 30 caracteres>" foi lida como <lido>, e é <esperado> ``.
Motivo escrito: *"Não tem custo (são duas expressões regulares) e fecha a única forma
de o conserto acima voltar em silêncio: alguém mexe no formato e `inconclusivo`
desaparece de novo dentro de `falhou`."*

#### 25.3.7 `suitePasses(dir)` — a segunda chance, e só para o que não mediu

Roda a suíte; se `lerSuite` devolver `inconclusivo`, roda **uma** segunda vez e
devolve a leitura dessa. Comentário no código: *"Uma segunda chance só para o que não
terminou: execução disputada acontece, e repetir uma medida que não houve é barato. O
que TERMINOU não se repete — repetir resultado até gostar dele é o oposto de medir."*

#### 25.3.8 `julgar(defect, dir)` — os sete estados

Lê o original de `join(RAIZ, defect.file)` (sempre da árvore de trabalho, nunca da
cópia). Então, em ordem:

| condição | estado devolvido | o que significa |
|---|---|---|
| `!original.includes(defect.from)` | `obsoleta` | o trecho mudou; a mutação precisa ser atualizada |
| `original.split(defect.from).length - 1 > 1` | `ambigua` (com `hits`) | o trecho aparece N vezes e `String.replace` troca só a primeira |
| `lerSuite` deu `inconclusivo` duas vezes | `inconclusivo` | medida que não houve |
| tem `equivalente` e a suíte **pegou** | `marcador-errado` | o marcador precisa sair: a regra ganhou teste |
| tem `equivalente` e a suíte **não** pegou | `equivalente` | nenhum teste possível distingue |
| sem marcador, suíte pegou | `pego` | ok |
| sem marcador, suíte não pegou | `sobreviveu` | buraco na barra |

A escrita e a restauração: `writeFileSync(join(dir, defect.file),
original.replace(defect.from, defect.to))`, mede, e depois `writeFileSync(join(dir,
defect.file), original)` para o próximo defeito daquele trabalhador.

A checagem de ambiguidade tem motivo escrito, e é caso real: *"`String.replace` com
texto troca a PRIMEIRA e cala sobre o resto. Quando o mesmo SQL aparece em duas
funções — foi o caso do piso por local, que a contagem e a perda escrevem igual — o
relatório diz 'ok' tendo exercitado metade da regra, e a outra metade fica sem rede
achando que tem."*

E o motivo do marcador de equivalência, transcrito:

> Uma mutação é EQUIVALENTE quando nenhum teste possível a distingue do original — o
> caso clássico é defesa em profundidade: duas checagens em camadas guardando a mesma
> coisa, onde tirar uma deixa a outra pegando e o comportamento observável não muda.
> Chamar isso de "sobreviveu" manda alguém caçar um buraco que não existe; chamar de
> "pego" é mentira.
>
> O marcador não é escapatória: ele exige motivo escrito, e se a mutação FOR pega o
> marcador vira erro — senão a lista apodrece guardando desculpas para buracos que já
> foram fechados.

#### 25.3.9 O laço de trabalho e a ordem do relatório

```js
const vereditos = new Array(DEFECTS.length);
let proximo = 0;
await Promise.all(
  Array.from({ length: TRABALHADORES }, async (_, n) => {
    const dir = join(OFICINA, `w${n}`);
    for (;;) {
      const meu = proximo;
      proximo += 1;
      if (meu >= DEFECTS.length) return;
      vereditos[meu] = await julgar(DEFECTS[meu], dir);
    }
  }),
);
```

Fila compartilhada por índice, veredito guardado na posição da lista. `julgar` devolve
em vez de imprimir, e o motivo está escrito: *"a ordem de impressão é a da LISTA, não
a de quem terminou primeiro. Relatório fora de ordem é relatório que ninguém consegue
comparar com a execução de ontem."*

#### 25.3.10 A saída, transcrita linha por linha

Antes de julgar:

```
Quebrando o código de propósito, <DEFECTS.length> vezes, em <TRABALHADORES> frentes.
```

Por veredito:

| estado | o que imprime |
|---|---|
| `obsoleta` | `?  <file>: o trecho mudou — atualize esta mutação` + a linha `hurts` |
| `ambigua` | `?  <file>: o trecho aparece <hits> vezes` · `a troca pega só a primeira — dê contexto ao \`from\` até ele ser único` · `hurts` |
| `inconclusivo` | `NÃO MEDIDO  <file>` · `a suíte não chegou a imprimir resumo, duas vezes — máquina disputada,` · `memória, ou o \`npx\` que não subiu. Não é proteção e não é buraco: é` · `medida que não houve. Rode de novo com a máquina livre.` · `hurts` |
| `marcador-errado` | `MARCADOR ERRADO  <file>` · `marcada como equivalente e a suíte PEGOU: <equivalente>` · `tire o marcador — a regra ganhou teste desde que ele foi escrito` |
| `pego` | `ok <hurts>` |
| `sobreviveu` | `PASSOU DESPERCEBIDO  <file>` · os 90 primeiros caracteres de `from` · `vira <90 primeiros de to>` · `e ninguém percebe: <hurts>` |
| `equivalente` | nada na hora; acumula para o fim |

`obsoleta`, `ambigua`, `inconclusivo`, `marcador-errado` e `sobreviveu` **todos**
incrementam `survivors`. Fecho:

```
<survivors> defeito(s) atravessaram a suíte inteira.
Verde não quer dizer protegido — quer dizer que os exemplos não exercitam a regra.
```
com `process.exit(1)`. Se `survivors === 0`:

```
Os <DEFECTS.length - equivalentes.length> defeitos foram pegos. A suíte morde onde promete morder.
```
e, havendo equivalentes:

```
E <n> mutação(ões) são EQUIVALENTES — nenhum teste possível as distingue:
   <file>: <equivalente>
   Elas ficam na lista porque apagá-las esconderia a redundância que as torna assim.
```

#### 25.3.11 Os dois marcadores de equivalente que existem hoje

Ambos em `src/data/repository.ts`, ambos com o **mesmo** texto de justificativa
(`scripts/mutate.mjs:235-237` e `:245-248`):

> o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de
> dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o
> mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode
> distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.

São as **posições 20 e 21** da lista. `docs/roadmap.md:46` resume o estado esperado:
**"106 defeitos plantados, 104 pegos e 2 equivalentes"**.

#### 25.3.12 A mutação que foi removida, com o motivo escrito

`scripts/mutate.mjs:656-663`, transcrito:

> A mutação do `balanceAt` saiu com a função.
>
> Ela prometia que quebrar o limite faria "a excursão de temperatura acusar o lote
> errado" — e não existe tela de excursão, nem chamador para aquela função. Era uma
> mordida numa regra sem efeito em produção: o portão dizendo "a suíte morde onde
> promete morder" sobre uma promessa que ninguém podia cobrar. Quando a tela existir,
> a mutação volta apontando para o SQL que ela vai usar.

#### 25.3.13 O que o `mutate` NÃO alcança, e a regra de arquitetura que sai disso

`src/bar.test.ts:30-34` diz o que a guarda de números não faz e por quê: *"não roda o
`db:verify` nem o `mutate` — isso custa um Postgres e seis minutos… Um `mutate` que
passasse a FALHAR não seria pego por aqui; é trabalho do `mutate`."*

`docs/insights.md:1806-1843` registra a limitação estrutural e a regra que ela gerou:
o `mutate` roda `npm test`, a suíte rápida, então **regra que mora dentro de um
componente React nunca é alcançada por ele**, "por mais e2e que se escreva". A regra:
*"toda decisão que merece um mutante mora no domínio. Se está numa tela, ou não
merece o mutante, ou está no lugar errado."* `pickSuggestion` e `qrPath` nasceram
desse critério; a zona de silêncio do QR sobreviveu a dois mutantes até descer para
`src/domain/qr.ts`. O mesmo padrão reaparece em `docs/insights.md:2870-2873`: a regra
de claro/escuro saiu do provider para `src/theme/scheme.ts` porque, dentro do
provider, "só o navegador a alcançava, e o `mutate` roda a unidade — as duas mutações
que a protegem **teriam sobrevivido**, com o e2e verde dizendo que estava tudo bem".

Exceção observada na lista: **quatro** das 106 mutações apontam para arquivos de tela
em `app/` — `app/(tabs)/index.tsx` (1), `app/purchase.tsx` (1), `app/production/new.tsx`
(1) e `app/inputs/[id].tsx` (1). Elas existem porque o defeito era a tela chamar a
função de domínio com o argumento errado (o filtro de local ausente), o que a unidade
alcança lendo o arquivo.

#### 25.3.14 Distribuição das 106 mutações por arquivo

| arquivo alvo | mutações |
|---|---|
| `src/data/repository.ts` | 40 |
| `src/assistant/skills.ts` | 10 |
| `src/domain/recipe.ts` | 6 |
| `src/domain/alerts.ts` | 4 |
| `src/domain/money.ts` | 4 |
| `src/data/erase.ts` | 3 |
| `src/domain/cost.ts` | 3 |
| `src/theme/scheme.ts` | 2 |
| `src/i18n/locales/pt-BR.ts` | 2 |
| `src/domain/picking.ts` | 2 |
| `src/domain/briefing.ts` | 2 |
| `src/domain/agreement.ts` | 2 |
| `src/domain/qr.ts` | 2 |
| `src/domain/day.ts` | 2 |
| `src/domain/measure.ts` | 2 |
| `src/sync/serialize.ts` | 2 |
| `src/i18n/company.ts` | 2 |
| `src/data/seed.ts` | 1 |
| `src/notify/phrase.ts` | 1 |
| `src/notify/facts.ts` | 1 |
| `src/domain/lot.ts` | 1 |
| `src/i18n/index.ts` | 1 |
| `src/assistant/text.ts` | 1 |
| `src/assistant/index.ts` | 1 |
| `src/data/db.ts` | 1 |
| `src/domain/access.ts` | 1 |
| `src/domain/ledger.ts` | 1 |
| `src/domain/units.ts` | 1 |
| `src/theme/tokens.ts` | 1 |
| `app/(tabs)/index.tsx` | 1 |
| `app/purchase.tsx` | 1 |
| `app/production/new.tsx` | 1 |
| `app/inputs/[id].tsx` | 1 |
| **total** | **106** |

#### 25.3.15 Os grupos curados, na ordem em que aparecem na lista

Os comentários de bloco dentro de `DEFECTS` nomeiam de onde cada família veio. Todos
transcritos, com a linha:

| linha | título do bloco |
|---|---|
| 32 | a camara fria invisivel para o aviso de validade, 4 de setembro |
| 45 | o estorno que devolvia a quantidade e nao o dinheiro, 4 de setembro |
| 64 | o apagador que conhecia 12 das 21 tabelas, 4 de setembro |
| 83 | a luz da tela, 4 de setembro |
| 104 | o rótulo que conta uma variável e nomeia outra, 4 de setembro |
| 135 | o que estava dentro da câmara quando a leitura saiu da faixa |
| 148 | a seção de dicionário que ninguém lê |
| 160 | o seletor do e2e contra o dicionário |
| 173 | a lista de compras de um plano |
| 197 | qual ficha rodou, que o lote passou a carimbar |
| 213 | o estorno e o custo do que sai do tacho, que entraram hoje |
| 788 | a contagem comparada com o saldo de outra sala, 4 de setembro |
| 800 | a porcentagem montada a mao, 4 de setembro |
| 813 | os dois idiomas sem caminho, 4 de setembro |
| 833 | a tinta ilegivel no corredor da camara, 4 de setembro |
| 845 | os tres atos sem grupo, logo sem estorno, 4 de setembro |
| 881 | a orfa que travava a fila, 4 de setembro |
| 893 | a producao impossivel com insumo na camara, 4 de setembro |
| 906 | o freezer cheio que a conta nao via, 4 de setembro |

Notas de bloco que carregam decisão de produto, transcritas:

- **A luz da tela** (`:83-88`): *"O dono abriu o Papel num celular em modo escuro e
  nao teve como trocar. O erro nao era de codigo: claro contra escuro e preferencia de
  quem segura o aparelho, entao tinha que ser dado com os dois caminhos, e a unica
  pergunta legitima era qual e o padrao. Duas mutacoes, uma por metade da regra."*
- **O rótulo que conta uma variável e nomeia outra** (`:104-110`): *"Trinta e um
  defeitos da mesma família num dia, e nenhum deles é erro de conta: o número está
  certo e a palavra ao lado afirma outra coisa sobre ele… duas das asserções que
  existiam passavam vacuamente, o que é pior que faltar."*
- **A seção de dicionário que ninguém lê** (`:148-151`): *"O CLAUDE.md cita 'quatro
  seções de dicionário nos três idiomas sem uma tela' ao explicar por que o portão
  virou por item. Quando eu varri, eram sete."*
- **O seletor do e2e contra o dicionário** (`:160-164`): *"O defeito que esta guarda
  pega custou um CI vermelho de vinte minutos: um rótulo renomeado numa linha de
  tradução, e três checagens do navegador esperando trinta segundos cada por um campo
  que não existe mais."*
- **O apagador que conhecia 12 das 21 tabelas** (`:64-67`): *"A guarda que devia pegar
  isto comparava uma lista escrita a mao consigo mesma. Agora ela LE o esquema, e
  estas duas mutacoes provam que ela le."*
- **Os três atos sem grupo** (`:845-850`): *"A primeira fundacao do projeto diz que se
  corrige por estorno, e tres dos sete caminhos de escrita nao gravavam grupo: a
  compra, a contagem e a perda. O que nao tem grupo nao e achado, e o que nao e achado
  nao e desfeito."*
- **O estorno e o custo do que sai do tacho** (`:213-217`): *"Regra nova sem mutação é
  regra protegida por coincidência: a suíte fica verde porque os exemplos escolhidos
  não a exercitam. Estas seis quebram de propósito o que o estorno e a média do produto
  prometem."*

#### 25.3.16 A lista completa das 106 mutações curadas

Formato de cada entrada: **número.** arquivo alvo *(linha em `scripts/mutate.mjs`)*,
o texto `from`, o texto `to`, e a frase `hurts` que justifica. Quebras de linha
dentro de um trecho de código aparecem como `¶`.

**1.** `app/(tabs)/index.tsx` *(mutate.mjs:37)*  
   de `expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5),`  
   para `expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5, LOCAL_COMPANY_ID),`  
   dói: o cartao de validade da capa volta a olhar so o almoxarifado, e emudece no dia em que o lote vai para a camara fria ou para a loja - o produto vence longe dos olhos e o aviso nunca toca

**2.** `src/data/repository.ts` *(mutate.mjs:49)*  
   de `for (const itemId of new Set(plan.legs.map((l) => l.itemId))) {`  
   para `for (const itemId of new Set([])) {`  
   dói: estornar volta a devolver so a quantidade: quem digitou 50 onde sairam 500 conserta o estoque e fica com o custo dez vezes alto embaixo de "dinheiro parado", do valor de cada lugar e do valor da carga que chega na loja

**3.** `src/data/repository.ts` *(mutate.mjs:56)*  
   de `AND m.kind <> 'reversal' ¶ AND ${NAO_ESTORNADO} ¶ ORDER BY m.occurred_at, m.recorded_at, m.id`  
   para `ORDER BY m.occurred_at, m.recorded_at, m.id`  
   dói: a recomposicao do custo passa a contar a corrida errada E a perna do estorno, entao a media fica no valor envenenado com a quantidade certa - o estorno vira maquiagem

**4.** `src/data/erase.ts` *(mutate.mjs:68)*  
   de `'lots', ¶`  
   para ``  
   dói: lots volta a ficar de pe quando "apagar tudo" some com items, e o DELETE levanta FOREIGN KEY: a transacao inteira volta atras, nada e apagado, e a tela mostra erro cru de SQLite em ingles depois do toque

**5.** `src/data/erase.ts` *(mutate.mjs:75)*  
   de `return { ...nothing, purchases: counts.purchases, movements: counts.movements };`  
   para `return { ...nothing, purchases: counts.purchases };`  
   dói: apagar "compras" volta a levar TODO movimento da fabrica sem dizer: a confirmacao fala so de custo medio, e producao, contagem, perda e transferencia somem sem aviso e sem volta

**6.** `src/theme/scheme.ts` *(mutate.mjs:89)*  
   de `if (escolha === 'claro') return 'light';`  
   para `if (escolha === 'claro') return doAparelho === 'dark' ? 'dark' : 'light';`  
   dói: escolher Claro volta a nao valer nada: quem esta com o celular no escuro fica preso no escuro com o botao Claro aceso na tela, que e o defeito relatado com um rotulo mentindo por cima

**7.** `src/theme/scheme.ts` *(mutate.mjs:96)*  
   de `export const SCHEME_PADRAO: SchemeChoice = 'claro';`  
   para `export const SCHEME_PADRAO: SchemeChoice = 'sistema';`  
   dói: o padrao deixa de ser o claro que o dono decidiu e volta a ser o do aparelho: quem instala num celular escuro abre no escuro sem ter pedido

**8.** `src/data/seed.ts` *(mutate.mjs:111)*  
   de `return (found?.n ?? 0) > 0;`  
   para `return true;`  
   dói: o selo "inclui os dados de exemplo" volta a ser permanente: acende em todo aparelho para sempre, inclusive depois de apagar tudo e cadastrar o primeiro insumo proprio

**9.** `src/data/repository.ts` *(mutate.mjs:118)*  
   de `COUNT(DISTINCT o.id) AS orders,`  
   para `1 AS orders,`  
   dói: a dica da separacao volta ao singular somando varios pedidos: "pedido para 04/09: 420 un" com dois pedidos em aberto e a data so do primeiro

**10.** `src/data/repository.ts` *(mutate.mjs:125)*  
   de `baseUnits: r.total, ¶ baseUnit: r.base_unit,`  
   para `baseUnits: r.total, ¶ baseUnit: 'un',`  
   dói: seis quilos de acucar voltam a ser "6.000 unidades" na capa e na aba de transporte: a unidade existe no tipo e diz a coisa errada, que e pior que nao existir

**11.** `src/data/repository.ts` *(mutate.mjs:139)*  
   de `AND m.occurred_at <= ? ¶ GROUP BY l.id, l.code, i.name, l.expires_on`  
   para `GROUP BY l.id, l.code, i.name, l.expires_on`  
   dói: a camara passa a listar o que esta la AGORA em vez do que estava na hora da leitura ruim, e o recall perde justamente o lote que ja viajou

**12.** `src/i18n/locales/pt-BR.ts` *(mutate.mjs:152)*  
   de `posts: {`  
   para `postsSemLeitor: {`  
   dói: uma secao de dicionario passa a nao ter leitor nem motivo escrito, e volta a parecer viva para quem for renomear o texto

**13.** `src/i18n/locales/pt-BR.ts` *(mutate.mjs:165)*  
   de `howMany: 'Quantidade, em {{pack}}',`  
   para `howMany: 'Quantas {{pack}}',`  
   dói: um rotulo renomeado deixa tres seletores do e2e procurando um campo que nao existe, e a suite so descobre no navegador vinte minutos depois

**14.** `src/domain/recipe.ts` *(mutate.mjs:174)*  
   de `return { itemId, needed: amount, held, missing: Math.max(0, amount - held) };`  
   para `return { itemId, needed: amount, held, missing: amount };`  
   dói: a lista de compras volta a dizer o que a receita pede em vez do que falta: quem tem 40.000 g de polpa na prateleira e um plano de 54.000 le "compre 54.000"

**15.** `src/domain/recipe.ts` *(mutate.mjs:181)*  
   de `const units = (recipe.yieldAmount * (1 - recipe.lossFraction) * line.batches) / perUnit;`  
   para `const units = line.batches;`  
   dói: o palito e o saquinho entram na lista de compras por TACHO em vez de por unidade: um tacho de quinhentos picoles pede um palito

**16.** `src/data/repository.ts` *(mutate.mjs:189)*  
   de `LEFT JOIN order_lines ol ON ol.item_id = p.item_id`  
   para `JOIN order_lines ol ON ol.item_id = p.item_id`  
   dói: a consulta volta a partir da linha de pedido: produto sem pedido some, e a tela de anotar pedido fica sem dica nenhuma no primeiro pedido do dia

**17.** `src/data/repository.ts` *(mutate.mjs:198)*  
   de `[lotId, companyId, product.itemId, code, input.producedOn, expires, recipe.versionId, at],`  
   para `[lotId, companyId, product.itemId, code, input.producedOn, expires, product.recipeId, at],`  
   dói: o lote volta a carimbar o id da RECEITA onde vai o da versao: corrigir a formula em marco reescreve de que ficha saiu o que janeiro produziu

**18.** `src/data/repository.ts` *(mutate.mjs:205)*  
   de `[id, companyId, product.id, recipe.versionId, input.batches, locationId, at],`  
   para `[id, companyId, product.id, product.recipeId, input.batches, locationId, at],`  
   dói: a corrida aberta grava o id da receita na coluna da versao - um uuid legitimo no lugar errado, que so aparece no dia em que alguem for perguntar qual ficha rodou

**19.** `src/data/repository.ts` *(mutate.mjs:218)*  
   de `AND m.kind = 'production' ¶ AND m.occurred_at >= ? ¶ AND m.occurred_at < ? ¶ AND ${NAO_ESTORNADO} ¶ GROUP BY m.item_id, i.name`  
   para `AND m.kind = 'production' ¶ AND m.occurred_at >= ? ¶ AND m.occurred_at < ? ¶ GROUP BY m.item_id, i.name`  
   dói: a corrida corrigida volta a contar como produzida: o almoxarifado fica certo e "produzido hoje" continua dizendo o numero errado

**20.** `src/data/repository.ts` *(mutate.mjs:232)*  
   de `if (plan.alreadyReversed || plan.blocked.length > 0) throw new CannotReverseError(plan);`  
   para `if (plan.alreadyReversed) throw new CannotReverseError(plan);`  
   **[equivalente]** o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.  
   dói: estornar uma corrida cujos picoles ja viajaram deixa saldo negativo na fabrica, e saldo negativo o livro-razao nao desfaz depois

**21.** `src/data/repository.ts` *(mutate.mjs:241)*  
   de `const dentro = await planReversal(companyId, input.groupId); ¶ if (dentro.alreadyReversed || dentro.blocked.length > 0) throw new CannotReverseError(dentro);`  
   para `const dentro = await planReversal(companyId, input.groupId); ¶ if (dentro.alreadyReversed && false) throw new CannotReverseError(dentro);`  
   **[equivalente]** o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.  
   dói: dois aparelhos estornam a mesma corrida no mesmo minuto e a correcao entra duas vezes, dobrada

**22.** `src/data/repository.ts` *(mutate.mjs:252)*  
   de `WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind <> 'reversal' ¶ ORDER BY m.quantity_base_units DESC`  
   para `WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind = 'production' ¶ ORDER BY m.quantity_base_units DESC`  
   dói: o estorno desfaz so a producao e deixa o consumo de pe: picole que nao consumiu nada, que parece certo e some com o insumo

**23.** `src/data/repository.ts` *(mutate.mjs:261)*  
   de `const mediaNova = blendRate(antes, { ¶ baseUnits: input.unitsProduced, ¶ rate: unitCostRate, ¶ });`  
   para `const mediaNova = antes.averageRate;`  
   dói: o produto fabricado volta a valer o que valia antes da corrida - zero, na primeira - e o dinheiro evapora do balanco a cada tacho

**24.** `src/domain/cost.ts` *(mutate.mjs:271)*  
   de `return ((held.averageRate * heldUnits + arriving.rate * arriving.baseUnits) / total) as Rate;`  
   para `return arriving.rate;`  
   dói: a media do produto vira o custo da ULTIMA corrida em vez da media do que esta em maos, e o estoque antigo passa a valer o preco de hoje

**25.** `src/domain/picking.ts` *(mutate.mjs:279)*  
   de `order.lines.every((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),`  
   para `order.lines.some((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),`  
   dói: carga parcial passa a fechar o pedido inteiro: a loja fica sem quarenta caixas e o sistema diz que entregou

**26.** `src/data/repository.ts` *(mutate.mjs:287)*  
   de `return moveBetween(companyId, input, 'return');`  
   para `return moveBetween(companyId, input, 'transfer');`  
   dói: a devolucao volta a ser gravada como carga, e "mandei 6.000 e voltaram 1.000" fica identico a "mandei 5.000" no livro-razao

**27.** `src/domain/briefing.ts` *(mutate.mjs:295)*  
   de `return [...ordenadas, ...novas].filter((w) => !escondidas.has(w));`  
   para `return [...ordenadas, ...novas];`  
   dói: o que o aparelho escondeu volta a aparecer na capa, e quem tirou o cartao de preco do caminho na camara fria o encontra la de novo

**28.** `src/domain/briefing.ts` *(mutate.mjs:302)*  
   de `const ordenadas = companyOrder.filter((w): w is BriefingWidget => known.has(w));`  
   para `const ordenadas = companyOrder as BriefingWidget[];`  
   dói: uma peca que saiu do catalogo continua na preferencia guardada e a capa quebra na atualizacao, no aparelho de quem ja usava

**29.** `src/domain/picking.ts` *(mutate.mjs:310)*  
   de `return sources.ordered ?? sources.lastSent ?? null;`  
   para `return sources.lastSent ?? sources.ordered ?? null;`  
   dói: a separacao volta a sugerir o envio da semana passada em vez do que a loja pediu, e quem esta com a lista na mao repete o habito em vez de atender o combinado

**30.** `src/data/repository.ts` *(mutate.mjs:317)*  
   de `AND o.place_id = ? ¶ AND o.status IN ('pending', 'open')`  
   para `AND o.status IN ('pending', 'open')`  
   dói: a lista de separacao passa a somar o pedido de TODAS as lojas, e a carga da loja centro sai com o que era da loja norte

**31.** `src/data/repository.ts` *(mutate.mjs:326)*  
   de `WHERE m.company_id = i.company_id AND m.item_id = i.id ¶ AND (? IS NULL OR m.location_id = ?))`  
   para `WHERE m.company_id = i.company_id AND m.item_id = i.id)`  
   dói: o almoxarifado volta a somar a empresa inteira mesmo quando perguntam por uma sala, e quem esta no tacho ve 34 kg de polpa que estao na camara fria

**32.** `src/data/repository.ts` *(mutate.mjs:335)*  
   de `const gasto = linha.quantityPerUnit * input.unitsProduced;`  
   para `const gasto = linha.quantityPerUnit * input.batches;`  
   dói: o palito passa a ser gasto por TACHO em vez de por unidade, e a corrida de 500 picoles baixa um palito do almoxarifado

**33.** `src/domain/recipe.ts` *(mutate.mjs:343)*  
   de `(unitPackaging.itemsRate ?? 0) +`  
   para `0 * (unitPackaging.itemsRate ?? 0) +`  
   dói: as telas cotam o custo sem a embalagem que sai do estoque, e a producao congela um numero maior que o que sete telas prometeram

**34.** `src/domain/alerts.ts` *(mutate.mjs:351)*  
   de `if (faixa === 'azul' && !settings.bands.notifyFull) continue;`  
   para `if (faixa === 'azul' && settings.bands.notifyFull) continue;`  
   dói: o aviso de cheio inverte: quem PEDIU para ser avisado deixa de receber, e quem nao pediu recebe todo dia que o almoxarifado esta cheio

**35.** `src/notify/phrase.ts` *(mutate.mjs:359)*  
   de `? // Grandeza física guarda a fração: meio grau de freezer é diferença`  
   para `? String(Math.round(alert.amount)) ||`  
   dói: a notificacao da camara arredonda o grau e -18,4 chega como -18: meia diferenca de freezer some justamente no aviso que deveria acusar a porta aberta

**36.** `src/notify/facts.ts` *(mutate.mjs:367)*  
   de `placeId: o.placeId,`  
   para `placeId: d.itemId,`  
   dói: o aviso passa a contar SABOR como se fosse loja, e quatro sabores pedidos pela mesma loja viram "quatro lojas esperando"

**37.** `src/domain/alerts.ts` *(mutate.mjs:375)*  
   de `if (settings.weekdays === 0) return true;`  
   para `if (settings.weekdays === 0) return false;`  
   dói: a configuracao vazia — que e a de todo mundo no primeiro dia — silencia TODOS os avisos, e o dono descobre no dia em que faltar polpa

**38.** `src/domain/alerts.ts` *(mutate.mjs:383)*  
   de `if (share <= bands.red) return 'vermelho';`  
   para `if (share < bands.red) return 'vermelho';`  
   dói: o limite da faixa passa a ser do amarelo, e o item exatamente no piso vermelho e desenhado como se estivesse melhor do que esta

**39.** `src/domain/alerts.ts` *(mutate.mjs:391)*  
   de `if (dia.getTime() <= now.getTime()) continue;`  
   para `if (dia.getTime() < now.getTime()) continue;`  
   dói: o aviso pode ser agendado para o instante presente, que e uma corrida com o sistema operacional — ele nao dispara e o aviso desaparece sem ninguem saber

**40.** `src/domain/agreement.ts` *(mutate.mjs:399)*  
   de `for (let ahead = 0; ahead < 7; ahead += 1) {`  
   para `for (let ahead = 1; ahead < 7; ahead += 1) {`  
   dói: quem faz o pedido no proprio dia de entrega da loja e empurrado para a semana que vem, e a carga que sairia hoje fica para dia 7

**41.** `src/domain/agreement.ts` *(mutate.mjs:407)*  
   de `if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {`  
   para `if (!Number.isInteger(weekday) || weekday < 0) {`  
   dói: um oitavo dia da semana recebe "nao combinado" em vez de parar, e o bug de quem chamou vira frase plausivel na tela

**42.** `src/data/repository.ts` *(mutate.mjs:415)*  
   de `AND m.quantity_base_units < 0 ¶ AND (? IS NULL OR m.location_id = ?)`  
   para `AND m.quantity_base_units < 0`  
   dói: o que dorme parado numa loja passa a ter data de acabar por causa do consumo da fabrica, e a tela manda comprar o que ninguem esta usando

**43.** `src/domain/qr.ts` *(mutate.mjs:424)*  
   de `const code = create(text, { errorCorrectionLevel: 'H' });`  
   para `const code = create(text, { errorCorrectionLevel: 'L' });`  
   dói: a etiqueta perde metade da tolerancia a dano de graca: com onze caracteres os quatro niveis cabem na mesma grade, e o codigo arranhado no frio deixa de ser lido

**44.** `src/domain/qr.ts` *(mutate.mjs:431)*  
   de `export const QUIET_ZONE = 4;`  
   para `export const QUIET_ZONE = 0;`  
   dói: a zona de silencio do QR some, o papelao da caixa encosta no codigo e o leitor desiste de ler

**45.** `src/data/repository.ts` *(mutate.mjs:439)*  
   de `await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, lotId);`  
   para `await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, null);`  
   dói: a corrida cria o lote e nao o carimba em linha nenhuma: o recall procura o picole e nao acha de onde ele saiu

**46.** `src/data/repository.ts` *(mutate.mjs:446)*  
   de `await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);`  
   para `await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, lotId);`  
   dói: o lote do picole passa a carimbar a saida da polpa, e um recall de picole manda recolher o saco de acucar

**47.** `src/data/repository.ts` *(mutate.mjs:453)*  
   de `const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);`  
   para `const code = input.lotCode ?? lotCode(input.producedOn, 1);`  
   dói: as duas corridas do mesmo dia recebem o mesmo codigo, e recolher uma passa a significar recolher as duas

**48.** `src/domain/lot.ts` *(mutate.mjs:460)*  
   de `if (shelfLifeDays === null || !Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;`  
   para `if (!Number.isFinite(shelfLifeDays)) return null;`  
   dói: produto sem prazo cadastrado passa a vencer no dia em que foi feito, e a camara fria descarta mercadoria boa

**49.** `src/data/repository.ts` *(mutate.mjs:468)*  
   de `WHERE m.company_id = ? AND m.location_id = ? ¶ GROUP BY m.item_id, i.name`,`  
   para `WHERE m.company_id = ? ¶ GROUP BY m.item_id, i.name`,`  
   dói: o tacho passa a ser autorizado pelo açúcar que está na loja, a dez quilômetros dali, e o consumo entra na fábrica deixando a sala negativa

**50.** `src/domain/day.ts` *(mutate.mjs:475)*  
   de `const day = localDate(event.occurredAt, timeZone);`  
   para `const day = event.occurredAt.slice(0, 10);`  
   dói: a régua da semana passa a cortar o dia em UTC, e o tacho fechado às 22h aparece na coluna do dia seguinte

**51.** `src/data/repository.ts` *(mutate.mjs:483)*  
   de `AND o.status IN ('pending', 'open')`  
   para `AND o.status IN ('pending', 'open', 'delivered')`  
   dói: pedido entregue continua contando como demanda, e a fabrica produz de novo o que ja saiu pela porta

**52.** `src/data/repository.ts` *(mutate.mjs:493)*  
   de `const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open';`  
   para `const status: OrderStatus = 'open';`  
   dói: a fabrica que exige aprovacao passa a gravar pedido ja valendo, e a aprovacao que ela ligou vira decoracao

**53.** `src/domain/day.ts` *(mutate.mjs:499)*  
   de `return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);`  
   para `return dayWindow(atIso, timeZone, days).from.slice(0, 10);`  
   dói: a data combinada volta a sair do instante, e o pedido de quinta aparece como quarta em todo fuso positivo

**54.** `src/i18n/index.ts` *(mutate.mjs:505)*  
   de `const nowhereToPutIt = !variants.one.includes('{{n}}') && !variants.other.includes('{{n}}');`  
   para `const nowhereToPutIt = false;`  
   dói: o numero some da frase que nao tem onde recebe-lo, e o cartao anuncia uma falta sem dizer de quanto

**55.** `src/assistant/skills.ts` *(mutate.mjs:512)*  
   de `const batches = declarados ?? (porTacho > 0 ? units / porTacho : 0);`  
   para `const batches = declarados ?? 1;`  
   dói: o assistente volta a debitar um tacho inteiro por qualquer quantidade dita, e a polpa some do papel sem sair da prateleira

**56.** `src/assistant/text.ts` *(mutate.mjs:518)*  
   de `return null; ¶ } ¶ ¶ // Last resort`  
   para `return [...contains].sort((a, b) => a.name.length - b.name.length)[0]; ¶ } ¶ ¶ // Last resort`  
   dói: com a grade de linha x tipo x sabor, "morango" alcanca doze produtos e o assistente grava calado contra o de nome mais curto

**57.** `src/assistant/skills.ts` *(mutate.mjs:524)*  
   de `for (const p of perdas) porMotivo.set(p.reason, (porMotivo.get(p.reason) ?? 0) + p.valueCents);`  
   para `for (const p of perdas) porMotivo.set(p.reason, Math.max(porMotivo.get(p.reason) ?? 0, p.valueCents));`  
   dói: o assistente aponta a maior perda isolada como causa, e manda olhar o freezer quando quem come o mes e a validade

**58.** `src/domain/money.ts` *(mutate.mjs:530)*  
   de `return Math.round(unitRate * quantity) as Cents;`  
   para `return Math.floor(unitRate * quantity) as Cents;`  
   dói: todo custo sai um pouco baixo, sempre para o mesmo lado, e a margem sai alta

**59.** `src/domain/money.ts` *(mutate.mjs:536)*  
   de `return ((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate;`  
   para `return (pricePerPurchaseUnit / baseUnitsPerPurchaseUnit) as Rate;`  
   dói: preço por unidade fica cem vezes menor: o picolé custa quase nada

**60.** `src/domain/money.ts` *(mutate.mjs:542)*  
   de `const shortfall = total - floors.reduce((a, b) => a + b, 0);`  
   para `const shortfall = 0;`  
   dói: o detalhamento do [por quê?] deixa de somar o número que ele explica

**61.** `src/domain/recipe.ts` *(mutate.mjs:548)*  
   de `const netYield = recipe.yieldAmount * (1 - recipe.lossFraction);`  
   para `const netYield = recipe.yieldAmount * (1 + recipe.lossFraction);`  
   dói: a perda barateia o produto em vez de encarecer

**62.** `src/domain/recipe.ts` *(mutate.mjs:554)*  
   de `if (cached) return cached; ¶ ¶ if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);`  
   para `if (cached) return cached; ¶ ¶ if (false) throw new RecipeCycleError([...stack, recipeId]);`  
   dói: receita que se referencia trava o aplicativo em vez de recusar

**63.** `src/domain/recipe.ts` *(mutate.mjs:564)*  
   de `if (cached) return cached; ¶ ¶ if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]); ¶ ¶ const recipe = recipes[recipeId]; ¶ if (!recipe) throw new MissingRecipeError(recipeId);`  
   para `if (cached) return cached; ¶ ¶ if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]); ¶ ¶ const recipe = recipes[recipeId]; ¶ if (!recipe) return { recipeId, version: 0, batchCents: cents(0), netYield: 0, perYieldUnit: 0 as Rate, lines: [], lossFraction: 0 };`  
   dói: semi-acabado que sumiu deixa todos os sabores dele mais baratos, calado

**64.** `src/domain/cost.ts` *(mutate.mjs:580)*  
   de `if (change > PRICE_ALARM) return 'wellAbove';`  
   para `if (change > PRICE_ALARM * 10) return 'wellAbove';`  
   dói: a compradora deixa de ser avisada de um aumento de 40%

**65.** `src/domain/cost.ts` *(mutate.mjs:586)*  
   de `return Math.ceil(dailyConsumption * (leadTimeDays + safetyDays));`  
   para `return Math.floor(dailyConsumption * (leadTimeDays + safetyDays));`  
   dói: o ponto de pedido pede menos do que o consumo, e a fábrica para

**66.** `src/data/repository.ts` *(mutate.mjs:592)*  
   de `(SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m ¶ WHERE m.company_id = i.company_id AND m.item_id = i.id ¶ AND (? IS NULL OR m.location_id = ?))`  
   para `(SELECT COALESCE(COUNT(m.quantity_base_units), 0) FROM movements m ¶ WHERE m.company_id = i.company_id AND m.item_id = i.id ¶ AND (? IS NULL OR m.location_id = ?))`  
   dói: o estoque passa a contar movimentos em vez de somar quantidade

**67.** `src/data/repository.ts` *(mutate.mjs:602)*  
   de `const delta = counted - expected;`  
   para `const delta = counted;`  
   dói: conferir a prateleira dobra o estoque em vez de corrigi-lo

**68.** `src/data/erase.ts` *(mutate.mjs:608)*  
   de `if (counts.recipeLinesUsingInputs > 0) {`  
   para `if (false) {`  
   dói: apagar insumos deixa receitas apontando para o nada

**69.** `src/data/db.ts` *(mutate.mjs:614)*  
   de `CAST(l.total_cents AS REAL) / l.base_units`  
   para `CAST(l.total_cents AS REAL) / 100.0 / l.base_units`  
   dói: a migração congela o custo de toda compra antiga cem vezes menor

**70.** `src/data/repository.ts` *(mutate.mjs:620)*  
   de `VALUES (?, ?, '', 'store_room', ?)`  
   para `VALUES (?, ?, '', 'storeroom', ?)`  
   dói: o local vai com um kind que o servidor não conhece e trava a fila inteira atrás dele

**71.** `src/sync/serialize.ts` *(mutate.mjs:626)*  
   de `if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {`  
   para `if (false) {`  
   dói: a média derivada volta a ter dois autores, e eles discordam

**72.** `src/domain/access.ts` *(mutate.mjs:632)*  
   de `operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock'],`  
   para `operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock', 'view_cost'],`  
   dói: o operador de fábrica passa a ver o custo, e ninguém pediu isso

**73.** `src/sync/serialize.ts` *(mutate.mjs:638)*  
   de `'operator_id',`  
   para `// 'operator_id',`  
   dói: quem estava operando some no caminho, e a empresa que ligou a pergunta não recebe a resposta

**74.** `src/assistant/index.ts` *(mutate.mjs:644)*  
   de `if (skill.requires && !context.capabilities.has(skill.requires)) {`  
   para `if (false) {`  
   dói: o assistente entrega custo a quem não pode ver custo

**75.** `src/domain/ledger.ts` *(mutate.mjs:650)*  
   de `if (dailyOutflow <= 0) return null;`  
   para `if (false) return null;`  
   dói: item que não sai nada vira cobertura infinita, e o briefing manda não produzir para sempre

**76.** `src/domain/units.ts` *(mutate.mjs:664)*  
   de `if (h.tiers[0].perBaseUnit !== 1) return false;`  
   para `if (false) return false;`  
   dói: hierarquia que começa na caixa passa a valer, e toda quantidade sai multiplicada por cinquenta

**77.** `src/domain/money.ts` *(mutate.mjs:670)*  
   de `return Math.round(value * factor) as Cents;`  
   para `return Math.trunc(value * factor) as Cents;`  
   dói: multiplicar dinheiro passa a cortar em vez de arredondar, sempre para baixo

**78.** `src/domain/measure.ts` *(mutate.mjs:676)*  
   de `return Number.isInteger(total) ? total : null;`  
   para `return Math.round(total);`  
   dói: uma embalagem de 2,5 g vira 3 g calado, e o fator errado fica embaixo de todo custo daquele insumo

**79.** `src/domain/measure.ts` *(mutate.mjs:682)*  
   de `if (matches.length !== 1) return null; // two numbers is ambiguous, not clever`  
   para `if (matches.length === 0) return null;`  
   dói: "caixa 6 x 500 ml" é lido como 6 ml, e o custo do insumo sai cem vezes errado

**80.** `src/assistant/skills.ts` *(mutate.mjs:688)*  
   de `const existing = items.find((i) => normalize(i.name) === normalize(name));`  
   para `const existing = findByName(items, name);`  
   dói: cadastrar polpa de açaí é recusado porque já existe polpa de morango, e a fábrica tem várias

**81.** `src/assistant/skills.ts` *(mutate.mjs:694)*  
   de `match: (q) => q.match(/(?:cadastrar|cadastre|criar|crie|novo)\s+(?:insumo\s+)?(.+?)\s*,\s*(.+)$/i),`  
   para `match: (q) => normalize(q).match(/(?:cadastrar|cadastre|criar|crie|novo)\s+(?:insumo\s+)?(.+?)\s*,\s*(.+)$/),`  
   dói: o insumo entra no catálogo sem acento - "polpa de acai" - e fica assim para sempre

**82.** `src/assistant/skills.ts` *(mutate.mjs:700)*  
   de `purchaseQuantity: packs, ¶ baseUnits, ¶ totalCents, ¶ assistantPhrase: ctx.question,`  
   para `purchaseQuantity: packs, ¶ baseUnits, ¶ totalCents, ¶ assistantPhrase: undefined,`  
   dói: o que o assistente lançou fica indistinguível do que a pessoa digitou, e "o que ele lançou este mês?" deixa de ter resposta

**83.** `src/data/repository.ts` *(mutate.mjs:712)*  
   de `FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`,`  
   para `FROM movements WHERE company_id = ? AND item_id = ?`,`  
   dói: contar a prateleira de um lugar compara com o saldo da empresa inteira e teleporta estoque entre salas, com o operador tendo feito tudo certo

**84.** `src/data/repository.ts` *(mutate.mjs:718)*  
   de `const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;`  
   para `const unitCostRate = (consumedValue / (input.batches * 500) + product.unitPackagingCents) as Rate;`  
   dói: o custo congela pelo rendimento prometido em vez do que saiu do tacho, e a perda some no instante em que aconteceu

**85.** `src/data/repository.ts` *(mutate.mjs:725)*  
   de `const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;`  
   para `const unitCostRate = (consumedValue / input.unitsProduced) as Rate;`  
   dói: o palito e o saquinho somem do custo congelado, e toda margem futura sai inflada exatamente pela embalagem - com sete telas continuando a prometer o número certo

**86.** `src/data/repository.ts` *(mutate.mjs:733)*  
   de `HAVING SUM(m.quantity_base_units) <> 0`  
   para `HAVING SUM(m.quantity_base_units) <> -1`  
   dói: lugar esvaziado volta a aparecer como "0 g", e a tela manda alguém conferir uma prateleira onde não tem nada

**87.** `src/data/repository.ts` *(mutate.mjs:740)*  
   de `AND kind = 'transfer' AND quantity_base_units > 0`  
   para `AND kind = 'transfer' AND quantity_base_units < 0`  
   dói: o palpite da remessa lê a perna de saída em vez da de entrada, e o campo nasce com um número negativo que o botão recusa em silêncio

**88.** `src/data/repository.ts` *(mutate.mjs:747)*  
   de `await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);`  
   para `await write(newId(), 'consumption', line.itemId, line.baseUnits, line.rate, null);`  
   dói: produzir passa a AUMENTAR o estoque de insumo, e o almoxarifado enche sozinho a cada tacho

**89.** `src/data/repository.ts` *(mutate.mjs:753)*  
   de `await leg(inId, at, input.baseUnits, input.toLocationId, input.fromLocationId);`  
   para `void inId;`  
   dói: a carga sai da fábrica e não chega em lugar nenhum: some do saldo da empresa como se tivesse evaporado no caminho

**90.** `src/assistant/skills.ts` *(mutate.mjs:759)*  
   de `stockAtPlace, ¶ whereIsItem, ¶ stockOfInput,`  
   para `stockOfInput, ¶ stockAtPlace, ¶ whereIsItem,`  
   dói: "quanto tem na loja centro" vira procura por um insumo chamado "na loja centro" e responde que não existe, com o saldo da loja ali do lado

**91.** `src/assistant/skills.ts` *(mutate.mjs:766)*  
   de `if (amount > held) {`  
   para `if (amount > held * 1000) {`  
   dói: o rascunho da carga é preparado sem ter o que mandar, e só falha na hora de gravar - depois que a pessoa já confiou nele

**92.** `src/assistant/skills.ts` *(mutate.mjs:773)*  
   de `: ' Contei os insumos pelo que saiu; se rodou tacho cheio, diga "em 2 tachos" que eu refaço.';`  
   para `: '';`  
   dói: o assistente conta os insumos pelo que saiu e nao diz, e quem rodou tacho cheio nao sabe que precisa corrigir

**93.** `src/assistant/skills.ts` *(mutate.mjs:780)*  
   de `requires: 'record_production',`  
   para `requires: 'dispatch',`  
   dói: quem só pode despachar passa a poder gravar produção, e o consumo de insumo entra pelas maos de quem nunca produziu

**94.** `src/data/repository.ts` *(mutate.mjs:793)*  
   de `const all = await listItems(companyId, undefined, true, locationId);`  
   para `const all = await listItems(companyId, undefined, true);`  
   dói: findItem volta a responder o total da empresa mesmo quando a pergunta e de uma sala: a tela da camara fria mostra o saldo da fabrica somado ao dela, e a diferenca da contagem sai desse numero

**95.** `app/purchase.tsx` *(mutate.mjs:805)*  
   de `{draft.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(draft.change), locale)}`  
   para `{draft.change >= 0 ? '▲' : '▼'} {(Math.abs(draft.change) * 100).toFixed(1)}%`  
   dói: a tela da compra volta a escrever "9.4%" para uma fabrica brasileira: ponto decimal do JavaScript no lugar da virgula de quem le, na tela onde o dono decide se a nota subiu demais

**96.** `src/i18n/company.ts` *(mutate.mjs:818)*  
   de `const currency = stored.currency && isCurrency(stored.currency) ? stored.currency : padrao.currency;`  
   para `const currency = padrao.currency;`  
   dói: a moeda escolhida pela empresa deixa de ser lida da gaveta: o botao marca peso mexicano, o aplicativo continua cobrando em real, e a escolha que nao vale e pior que a escolha que nao existe

**97.** `src/i18n/company.ts` *(mutate.mjs:825)*  
   de `return region ? `${language}-${region}` : language;`  
   para `return language;`  
   dói: a moeda para de decidir a regiao: espanhol passa a escrever 1.234,56 no Mexico, onde se escreve 1,234.56 - numero de dinheiro lido ao contrario, que muda uma decisao de compra

**98.** `src/theme/tokens.ts` *(mutate.mjs:837)*  
   de `inkFaint: '#6D6963',`  
   para `inkFaint: '#8A857D',`  
   dói: a tinta do rotulo volta a 3,39:1 no tema que sai da caixa: "por mil", "valor parado" e "conferido em" ficam ilegiveis no corredor da camara, com luva e tela suja - e a Lei 3 diz que numero nao aparece sozinho

**99.** `src/data/repository.ts` *(mutate.mjs:851)*  
   de `// que a nota tiver duas, o grupo por linha desfaria metade de uma nota, ¶ // que é a coisa que o estorno por ato existe para não deixar acontecer. ¶ purchaseId,`  
   para `// que a nota tiver duas, o grupo por linha desfaria metade de uma nota, ¶ // que é a coisa que o estorno por ato existe para não deixar acontecer. ¶ lineId,`  
   dói: o grupo da compra passa a ser a LINHA em vez da nota: no dia em que uma nota tiver duas linhas, desfazer volta meia nota e deixa a outra metade de pe

**100.** `src/data/repository.ts` *(mutate.mjs:862)*  
   de `// outra, e um zero digitado com o dedo torto ficava no razão para sempre. ¶ id,`  
   para `// outra, e um zero digitado com o dedo torto ficava no razão para sempre. ¶ null,`  
   dói: a contagem volta a nascer sem grupo, e um zero digitado com o dedo torto fica no razao para sempre - sem estorno e sem exclusao, que e a fundacao quebrada nas duas pontas

**101.** `src/data/repository.ts` *(mutate.mjs:871)*  
   de `// não sumiram. ¶ id,`  
   para `// não sumiram. ¶ null,`  
   dói: a perda volta a nascer sem grupo: "digitei 40 onde era 4" desconta trinta e seis quilos de dinheiro que nao sumiram, para sempre

**102.** `src/data/repository.ts` *(mutate.mjs:885)*  
   de `await forgetOrphans(conn);`  
   para ``  
   dói: apagar as compras de exemplo volta a deixar a fila apontando para movimentos que nao existem: o serializador levanta excecao, o motor para no primeiro buraco, e tudo o que a fabrica gravar depois fica preso atras dela

**103.** `app/production/new.tsx` *(mutate.mjs:898)*  
   de `listItems(LOCAL_COMPANY_ID, undefined, false, defaultLocationId(LOCAL_COMPANY_ID)),`  
   para `listItems(LOCAL_COMPANY_ID),`  
   dói: a tela de producao volta a ler o saldo da empresa e a liberar o botao com o insumo noutra sala: cada toque devolve o erro de programador do piso, e nenhuma corrida entra

**104.** `src/data/repository.ts` *(mutate.mjs:911)*  
   de `AND l.kind IN ('factory', 'cold_room', 'store_room')) AS on_hand`  
   para `AND l.kind IN ('factory', 'store_room')) AS on_hand`  
   dói: o que esta na camara fria para de contar como prometivel: a tela de anotar pedido nao avisa excesso nenhum com o freezer cheio, e a capa manda produzir o que ja existe

**105.** `app/inputs/[id].tsx` *(mutate.mjs:918)*  
   de `locationId: contarEm,`  
   para `locationId: defaultLocationId(LOCAL_COMPANY_ID),`  
   dói: a tela volta a gravar a contagem no almoxarifado qualquer que seja a sala aberta: contar a camara fria apaga da fabrica a diferenca entre as duas

**106.** `src/assistant/skills.ts` *(mutate.mjs:925)*  
   de `if (holding.length > 1) {`  
   para `if (holding.length > 99) {`  
   dói: o assistente volta a preparar contagem de item que esta em duas salas comparando com o total da empresa, e a gravar a diferenca no almoxarifado - a mesma teleportacao que a tela tinha, agora por voz


---

### 25.4 `npm run e2e` e `npm run e2e:fast` — o app dirigido num navegador

`npm run e2e` = `node e2e/flow.mjs` (`package.json:15`).
`npm run e2e:fast` = `node scripts/e2e-parallel.mjs` (`package.json:17`).
Estado: **implementado e chamado** — o CI roda `npm run e2e` (não o `:fast`)
(`.github/workflows/ci.yml:92-93`), e a barra do `CLAUDE.md` manda rodar `npm run
e2e:fast`. A contagem de checagens é verificada por `src/bar.test.ts:130`.

#### 25.4.1 Os três bugs que só apareceram no navegador

Transcrito de `e2e/flow.mjs:9-22`:

> The app, driven the way a person drives it.
>
> This exists because an evening of unit tests said everything was fine while the app
> in a browser was quietly refusing to save anything: `Alert` is a no-op there, so
> every confirmation asked a question nobody saw. Two other failures hid in the same
> blind spot - every route but the home screen opened onto an unseeded database, and
> one screen mixed two languages.
>
> None of those are visible from inside a module. They are only visible from the
> outside, with a real browser, real storage and real navigation. So the check that
> found them is now the check that keeps finding them.
>
>   npm run e2e

Os três, nomeados:

1. **`Alert` é no-op na web** — toda confirmação fazia uma pergunta que ninguém via, e
   nada era salvo. Consequência de produto: o aplicativo passou a ter confirmação
   própria, e as checagens afirmam isso com a frase *"Alert would have shown nothing
   here"* (`e2e/flow.mjs:565` e `:852`).
2. **Toda rota que não a capa abria num banco não semeado** — daí as checagens de
   "deep link" (`:205`, `:232`), cujo comentário diz: *"an unexercised route is the one
   that greets somebody with 'nothing here yet' the first time they tap it"*
   (`:233-236`).
3. **Uma tela falava dois idiomas** — daí as asserções `doesNotMatch(text,
   /\bcrate\b|\bboxes\b|\bunits\b/, 'no English leaking through')` (`:229`) e
   `doesNotMatch(text, /\bDelete\b|\bSettings\b|\bErase\b/, 'no English leaking
   through')` (`:340`).

`CLAUDE.md` diz o mesmo em português: *"O `e2e` existe porque três bugs passaram por
toda a bateria unitária e só apareceram quando o app foi aberto: uma confirmação que
não existe na web, rotas que abriam num banco vazio, e uma tela falando dois idiomas.
**Nada disso é visível de dentro de um módulo.**"*

#### 25.4.2 A infraestrutura de `e2e/flow.mjs`

| item | valor / regra | linha |
|---|---|---|
| `PORT` | `Number(process.env.E2E_PORT ?? 4178)` | `:25` |
| `ROOT` | `join(process.cwd(), 'dist')` | `:66` |
| `BROWSER` | `process.env.E2E_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)` | `:83-85` |
| `viewport` | `{ width: 412, height: 915 }` | `:1982-1987` |
| `locale` | `'pt-BR'` | idem |
| `timezoneId` | `'America/Sao_Paulo'` | idem |
| lançamento | `chromium.launch({ ...(BROWSER ? {executablePath: BROWSER} : {}), args: ['--no-sandbox'] })` | bloco final |

A escolha do Chromium tem motivo escrito (`:70-81`): *"`playwright-core` looks for the
exact build its version pins, which is a download this machine is not allowed to make.
Every environment that runs this suite already has a browser; it is just not the
numbered one. So: the env var wins, then the well-known symlink these images ship, and
only then Playwright's own guess. Without this the suite fails with a message about
installing browsers, which reads like a broken test rather than a missing path - and a
suite that looks broken is a suite people stop running."*

**O servidor.** `serve()` (`:107-118`) cria um `http.createServer` que resolve o
caminho contra `dist`, cai em `index.html` quando o arquivo não existe (roteamento de
SPA), e põe **três** cabeçalhos:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Content-Type: <por extensão, ou application/octet-stream>
```

Motivo dos dois primeiros, transcrito (`:100-105`): *"Without cross-origin isolation the
browser refuses SharedArrayBuffer and the WebAssembly build of SQLite cannot open
anything - so a server that forgets them fails in exactly the way this test is meant to
catch."*

A tabela de tipos MIME (`:87-97`), transcrita:

| extensão | Content-Type |
|---|---|
| `.html` | `text/html` |
| `.js` | `text/javascript` |
| `.css` | `text/css` |
| `.json` | `application/json` |
| `.wasm` | `application/wasm` |
| `.png` | `image/png` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.ttf` | `font/ttf` |
| `.woff2` | `font/woff2` |

#### 25.4.3 `assentar` e `screen` — as duas leituras de tela

`screen(page)` (`:169-170`):

```js
const screen = async (page) =>
  (await page.locator('body').innerText()).replace(/\u00a0/g, ' ').replace(/\n+/g, ' | ');
```

Toda a tela como uma linha só, com `|` entre blocos. O espaço não separável é
normalizado, e isso é decisão registrada (`:136`): *"The non-breaking space
matters: `Intl` puts one between 'R$' and the number in Portuguese, so an assertion
typed with an ordinary space silently never matches."*

`assentar(page, { limite = 20000, quieto = 400 })` (`:153-166`) — espera a tela
**parar de crescer**, não um número de milissegundos:

```js
const assentar = async (page, { limite = 20000, quieto = 400 } = {}) => {
  const ate = Date.now() + limite;
  let anterior = -1;
  let desde = Date.now();
  while (Date.now() < ate) {
    const agora = await page.evaluate(() => document.body.innerText.length);
    if (agora !== anterior) { anterior = agora; desde = Date.now(); }
    else if (agora > 0 && Date.now() - desde >= quieto) { return; }
    await page.waitForTimeout(100);
  }
};
```

Motivo escrito (`:141-152`): *"As checagens usavam `waitForTimeout(2500)`, e 2500 é um
palpite sobre a máquina: com quatro navegadores disputando quatro núcleos, a mesma
checagem reprovava numa fatia e passava três vezes seguidas quando rodada sozinha.
Trocar por `waitFor` de um elemento também não bastou — o elemento aparece antes de o
resto da tela montar, e a leitura vinha vazia."*

**`assentar` não substituiu todas as esperas.** Ela é usada em **três** checagens (nove chamadas)
(`:315`, `:1627`–`:1651`, `:1676`–`:1709`); a maioria das checagens ainda usa
`page.waitForTimeout(2500)` ou `(3000)`. Isso é o estado do código, não uma decisão
escrita.

#### 25.4.4 `--only <pedaço do nome>`

`:37-40`:

```js
const ONLY = (() => {
  const at = process.argv.indexOf('--only');
  return at >= 0 ? (process.argv[at + 1] ?? '').toLowerCase() : '';
})();
```

Filtra por `c.name.toLowerCase().includes(ONLY)`. Motivo (`:27-37`): *"Existe porque
consertar UMA verificação custava a suíte inteira: quatro minutos de exportação e vinte
e três navegações para ver uma linha mudar. O ciclo longo é o que faz alguém 'consertar'
pelo raciocínio em vez de rodar. Com filtro, a linha final DIZ que foi filtrada, e um
filtro que não casa com nada falha em vez de imprimir '0/0 passaram' - que é a forma de
todo defeito silencioso deste arquivo: um mecanismo relatando sucesso sem ter
trabalhado."*

#### 25.4.5 `--shard i/N` — o fatiamento em quatro

`:56-64`:

```js
const SHARD = (() => {
  const at = process.argv.indexOf('--shard');
  if (at < 0) return null;
  const [i, n] = `${process.argv[at + 1] ?? ''}`.split('/').map(Number);
  if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 1 || i > n) {
    console.error('--shard pede i/N, com 1 <= i <= N');
    process.exit(2);
  }
  return { i: i - 1, n };
})();
```

A seleção é `filtradas.filter((_, at) => at % SHARD.n === SHARD.i)` — **resto da
divisão, e não bloco contíguo**. O motivo, transcrito (`:42-55`): *"Cada checagem já
abre contexto novo do navegador — armazenamento separado, primeira instalação — então
elas são independentes por construção, e fatiar não muda o que cada uma prova. O que
muda é a espera: trinta checagens em série custavam cinco minutos por rodada… A fatia é
por RESTO da divisão e não por bloco contíguo: as checagens têm durações muito
diferentes (a que cadastra produto e produz leva quinze vezes o tempo da que só abre uma
tela), e blocos contíguos deixariam uma fatia terminando muito depois das outras."*

Ordem dos dois filtros: `--only` primeiro, `--shard` sobre o resultado dele.

#### 25.4.6 O contexto por checagem, e as duas escutas de erro

Cada checagem abre **contexto novo**, com o comentário do por quê (`:1972-1981`): *"A
fresh context per check: separate storage, so each starts on a first install exactly
like a person opening the app for the first time. E o aparelho é BRASILEIRO, dito em
vez de herdado. O navegador headless roda em `en-US`, e desde que o idioma virou
escolha da empresa — com o aparelho como palpite do primeiro dia — isso fazia o
aplicativo abrir em inglês. As trinta e cinco checagens afirmam texto em português:
elas passariam a reprovar todas, e por um motivo que não é defeito nenhum."*
(Note: o comentário diz "trinta e cinco"; a contagem hoje é 36.)

Duas escutas:

- `page.on('pageerror', (e) => errors.push(e.message))` — e, ao fim de cada checagem,
  `assert.deepEqual(errors, [], 'the console must be clean')`. **Console sujo reprova a
  checagem.**
- `page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning')
  console_.push(`${m.type()}: ${m.text()}`) })` — guardado e impresso (últimas 8
  linhas) **só quando a checagem falha**. Motivo (`:1992-1997`): *"Existe por causa de
  um erro real: o SQLite da web recusou uma gravação com 'Error finalizing statement' -
  a mensagem que o driver mostra depois de perder a de verdade. A suíte de unidade usa
  outro SQLite e passava. Sem o console do navegador na mão, o único caminho era
  adivinhar."*

Saída por checagem: `  ok   <name>` ou `  FAIL <name>` seguido de até 6 linhas da
mensagem de erro (prefixadas por 7 espaços) e das linhas de console (`       browser
<linha>`).

#### 25.4.7 A exportação, e a regra do reúso

`e2e/flow.mjs` exporta na abertura do bloco `try`:

```js
if (!existsSync(ROOT) || !process.env.E2E_REUSE_BUILD) {
  console.log('› exportando a versão web');
  const limpar = precisaLimpar();
  if (limpar) console.log('› o app.json mudou: exportando com o cache limpo');
  await run('npx', ['expo', 'export', '--platform', 'web', ...(limpar ? ['--clear'] : [])]);
  marcarExportado();
}
```

Motivo do reúso ser explícito (`:1931-1939`): *"This used to skip the export whenever
`dist` existed, which meant a change to a screen was tested against yesterday's bundle.
The suite went green for a screen that did not contain the change - the worst failure a
test can have, because it looks exactly like success. Reuse is now a choice made out
loud, for the case it was really for: iterating on the checks themselves."*

Motivo do `--clear` condicional (`:1939-1953`): o comentário anterior dizia que limpar
o cache do bundler "não compra nada" — *"Está errado, e o erro custou uma sessão inteira
de fotos e execuções lendo um pacote com o MANIFESTO de cinco versões atrás: a tela de
Ajustes dizia 0.2.0 com o `app.json` em 0.7.0."*

#### 25.4.8 As três guardas contra a suíte que não trabalhou

Ao fim (`:2024-2034`):

```js
if (checks.length === 0) {
  console.log('NENHUMA checagem registrada - a suíte não exercitou nada.');
}
if (ONLY && selected.length === 0) {
  console.log(`NENHUMA checagem casa com "${ONLY}" - o filtro não exercitou nada.`);
}
if (failures > 0 || checks.length === 0 || selected.length === 0) process.exitCode = 1;
```

Motivo (`:2024-2027`): *"A suite that registered nothing prints '0/0 passaram' and
exits happy, which is the same shape as every silent defect found today: a mechanism
reporting success without doing its work."*

A linha de fecho:

```
<selected.length - failures>/<selected.length> passaram
   [ (filtrado por "<ONLY>" - não é a suíte inteira) ]
   [ (fatia <i+1> de <n> - não é a suíte inteira) ]
```

#### 25.4.9 As 36 checagens, uma por uma

Cada linha traz o nome literal (é ele que `--only` casa), a linha em `e2e/flow.mjs`, e
o que ela verifica.

**1. `opens on the day, not on the price of a popsicle`** (`:172`) — a capa numa
instalação virgem. Exige `/NORVA/`, `/Primeiro dia/` e `/Lançar a primeira produção/`;
proíbe `/Nenhuma corrida registrada ainda/`, `/R\$ 0,64/` ("o custo por unidade não
mora mais na capa"), `/cada um/` e `/se atualizou sozinho/`. Comentário registrado:
*"Esta checagem media o custo por unidade na capa até o dono abrir o aplicativo
publicado e dizer que aquele número não interessava ali."*

**2. `the storeroom is seeded on a deep link, not only from home`** (`:205`) —
`/inputs` alcançado direto. Exige `/R\$ 1\.552,50/` ("the four inputs are worth this
much at average cost"), `/Polpa de morango/`, ausência de `/Nada cadastrado ainda/`, e
`/sem saída registrada ainda|acaba em|antes de um mês/` ("o dinheiro parado vem com
quanto tempo ele dura").

**3. `a product says how many units a batch makes, in one language`** (`:223`) —
`/products`: `/1 engradado, 4 caixas e 6 unidades/`; proíbe
`/\bcrate\b|\bboxes\b|\bunits\b/`.

**4. `the recipe list opens on a deep link and shows the seeded sheets`** (`:232`) —
`/recipes`: `/Base de creme/` ("the sub-recipe is there"), `/Picolé de morango/`,
ausência de `/Nada cadastrado ainda/`.

**5. `the five tabs are there, and the old addresses still answer`** (`:246`) — as
cinco abas **por papel de acessibilidade** (`getByRole('tab', {name})`, timeout 5000):
`Início`, `Produção`, `Transporte`, `Relatórios`, `Mais`. Comentário: *"Pelo papel, não
pelo texto: uma barra de abas que o leitor de tela não enxerga é uma barra que não
existe para quem usa luva e voz."* Depois `/reports`: `/Cada um abre num resumo de uma
tela/i`, `/Estoque/`, `/o que cada unidade custa/`, `/Perdas/`; proíbe `/margem|Espelho
da loja/i`. Depois `/more`: `/CADASTROS/`, `/Lojas e clientes/`, `/LANÇAMENTOS/`,
`/Pergunte/`; proíbe `/Financeiro|Notas fiscais|Pessoas/` ("a drawer that opens onto
nothing"). Por fim quatro endereços antigos: `/production` → `/Adicionar produção/i`,
`/production/new` → `/Quantas unidades/i`, `/transfer` → `/Transferir/`, `/transport` →
`/Para onde foi/`. O motivo desta checagem existir: *"The screens moved into
`app/(tabs)/`, a group whose name is in parentheses and therefore NOT in the URL…
twenty-six `page.goto` calls in this file address `/`, `/production` and `/transfer`,
and a rename would have broken every one of them at once."*

**6. `settings counts what erasing would take, in Portuguese`** (`:301`) — usa
`assentar`. Lê a versão de `app.json` (`JSON.parse(readFileSync('app.json',
'utf8')).expo.version`) e exige que a tela a diga: **é a guarda do manifesto embutido
no pacote**. Exige `/O que está guardado/`, `/Insumos/`, `/Inclui os dados de
exemplo/`, `/Lojas e clientes/`; proíbe `/\bDelete\b|\bSettings\b|\bErase\b/`.

**7. `typing the package fills in how much is inside it`** (`:343`) — `/inputs/new`,
Lei 1. Preenche o campo `Embalagem` com `saco 25 kg` e exige que `Quanto vem dentro`
passe a valer `'25000'`. Depois troca por `balde` e exige que **continue** `'25000'` —
*"an unreadable package must not wipe what is already there"*. Nota de seletor: *"Two
controls answer to 'Embalagem' on this screen… so this asks for the text box by name"*
(`getByRole('textbox', {name: 'Embalagem'})`).

**8. `the weather screen answers with or without internet`** (`:370`) — `/weather`.
Exige `/onde fica a fábrica/i` e `/Calor muda o que sai e o que estraga/`; proíbe
`/[Ss]orvete/` ("nenhuma regra de sorvete chumbada na tela"). Busca "Recife" e espera
`/Recife|Nenhuma cidade com esse nome/` com **timeout 20000**, porque *"a busca desiste
sozinha em oito segundos, e uma verificação que espera três reprovaria a tela por ela
estar fazendo exatamente o que prometeu"*. Depois exige `/Clima/` em `/more`. As duas
saídas — com e sem internet — são aceitas de propósito.

**9. `an order is written, and the briefing turns it into what to make`** (`:407`) — o
caminho inteiro pelas mãos de uma pessoa: `/places` → "Cadastrar um lugar" → nome "Loja
Centro" → "Salvar lugar"; `/orders/new` exige `/Loja ou cliente/` e `/livre para esta
data/` **antes do primeiro pedido existir**; `Quantidade` 300 → "Adicionar ao pedido" →
`/No pedido/` e `/300/`; "Anotar pedido" → "Anotar" → `/Loja Centro/`; a capa passa a
dizer `/Produza para os pedidos/` e `/300/`; volta a `/orders/new` e a dica continua
`/livre para esta data/`.

**10. `the picking list beats the habit: the order wins over last time`** (`:471`) — a
montagem exige as **duas fontes discordando**: produção de 500, loja criada,
transferência de 40 (o hábito), pedido de 300 (o combinado). Ao reabrir `/transfer` e
escolher o produto, exige `/pedido para/` e `/300/`. Comentário: *"Esta checagem existe
porque o mutante que inverte a ordem do palpite sobreviveu duas vezes. Ele só morre com
as duas fontes DISCORDANDO… Sem essa montagem, inverter a preferência dá o mesmo número
e o teste passa por acidente - que é a definição do teste que este projeto caça."*

**11. `the assistant answers with the number the engine computed`** (`:528`) —
`/assistant`, campo `Sua pergunta` = "quanto custa o picolé de morango", botão
"Perguntar", e a resposta exata: `/Picolé de morango custa R\$ 0,64 por unidade/`.

**12. `an invoice warns before it is committed, then moves everything`** (`:539`) —
`/purchase`: escolhe "Polpa de morango", `Quantidade, em …` = 4, `Total da nota` = 700.
Antes de gravar (Lei 4): `/41,1%/` — **com vírgula**, e a linha traz a cicatriz *"esta
linha exigia `41.1%` — o ponto decimal do JavaScript — e passou verde enquanto a tela
mostrava um número escrito em nenhum idioma para uma fábrica brasileira. A checagem
AFIRMAVA o defeito"* —, `/Subiu bem acima do normal/`, `/passa de R\$ 12,40 para R\$
14,95/`. A confirmação própria: `/Lançar esta compra\?/` e `/4 × balde 10 kg de Polpa
de morango, por R\$ 700,00/`. Depois: `/O que essa nota mexeu/` e `/R\$ 0,64 → R\$
0,73/`. Na capa: `/Mudou desde a última vez/`, `/Polpa de morango/`, `/▲ \d+,\d%/`. E
no histórico do insumo: `/R\$ 12,40 → R\$ 14,95/`, `/20,6%/`, `/Picolé de morango/`.

**13. `the briefing is up to date when you tap Back into it`** (`:605`) — a única
checagem que **não** recarrega com `page.goto` para voltar: *"a person does not reload,
a person taps Back. The briefing is the root of the stack - it mounts once per launch,
and on a phone that is days."* Caminho: aba `Mais` → cartão `Compras` → lança a nota →
`page.goBack()` → aba `Início`. Exige `/Mudou desde a última vez/` e `/▲ \d+,\d%/`;
proíbe `/estável há|nenhuma mudança de preço/` e `/Nada mudou de preço/`.

**14. `what came out today reaches the briefing, with what it was to compare`**
(`:662`) — a checagem mais longa. Capa virgem: `/Primeiro dia/` e `/Lançar a primeira
produção/`. Aba `Produção` → "Adicionar produção" → `Quantas unidades` 480 → "Registrar
produção" → "Registrar". Exige `page.locator('svg').count() > 0` ("a cena continua
desenhada depois da produção"). Aba do dia: `/Lotes de hoje/` e um código casando
`/\d{8}-\d\d/`. Toca o código: `/Etiqueta do lote/`, o código por extenso, `/produzido
em/`, `page.locator('svg path').count() > 0` ("e o QR está desenhado, não é um espaço
vazio" — é a **única** checagem que prova que o codificador de QR sobrevive ao
empacotamento) e `/Saiu da ficha .*, versão \d+\./`. Volta, aba `Início`: `/480/`,
`/unidades saíram hoje/`, `/primeira produção registrada/`, `/Últimas corridas/`,
`/média das últimas/`. Toca "Últimas corridas": `/toque para fechar/` e `/\d{8}-\d\d/`;
toca de novo e exige que feche.

**15. `a production marked as under way pulses on the briefing, and closing it writes
the ledger`** (`:765`) — capa sem produção: proíbe `/produção em curso|produções em
curso/i`. Aba `Produção` → "Adicionar produção" → **"Começar agora"** → `/Produção em
curso/` e `/Picolé de morango/`. Capa: `/uma produção em curso/`. Depois fecha: 480 →
**"Fechar a produção"** → "Registrar". Capa: proíbe `/produção em curso/i`, exige
`/480/`.

**16. `production pre-fills what the sheet promises, and records what happened`**
(`:815`) — Lei 2. `/production/new` já aberta diz `/Quantas unidades saíram/i`, `/A
ficha prevê 506/`, `/Vai baixar do estoque/`, `/Polpa de morango/`. O número 506 é
derivado da ficha semeada — o comentário registra a conta: *"The sheet says 40 L, 5%
loss, 75 ml a stick, so one kettle promises 506 - and that number is typed by nobody."*
Depois "Informar pela receita", 480 unidades, e `/26 unidades a menos que o previsto/`
e `/dá .*caixas?/i`. Confirmação: `/Confirmar a produção/`, `/Você produziu 480
unidades de Picolé de morango, rodando a receita uma vez/`, `/congela o custo em R\$
\d+,\d\d por unidade/`. Por fim `/inputs` exige `/22\.000 g/` ("the pulp came down by
exactly one kettle").

**17. `a second unclassified product is refused with a sentence, not with SQLite`**
(`:867`) — `/products/new`, nome "Picolé sem classificação", copiando de "Picolé de
morango". Exige `/Já existe .* com essa classificação/` e `/catálogo fica em Ajustes/`;
proíbe `/finalizing statement/` ("sem jargão de driver na cara do dono"). Comentário
registra a decisão de esquema: *"O índice único da grade trata nulo como valor -
decisão registrada na migração 0018, 'o mesmo produto não se cadastra duas vezes'."*

**18. `a cold room reading becomes history today, sensor or no sensor`** (`:895`) — a
segunda mais longa. Cria "Câmara 1" com tipo `Câmara fria` (clicado pelo **rótulo de
acessibilidade**, porque o tipo é um `Text` com marcador `○`). Sem leitura: `/Câmara
1/`, `/nenhuma leitura anotada ainda/`, `/Temperatura agora/i`; e proíbe a frase
repetida duas vezes (almoxarifado não pergunta temperatura). Anota `-18,4` →
`/última: -18,4 °C/` ("a fração sobrevive até a tela: meio grau de freezer importa"); e
**sem faixa cadastrada proíbe julgamento**: `doesNotMatch(/fora da faixa|dentro da
faixa/)`. Cadastra faixa mínima `-22` e máxima `-16` → `/dentro da faixa/`. Anota `-8`
→ `/fora da faixa de -22 a -16/`. Com a câmara vazia, proíbe `/ESTAVA NA CÂMARA/`
("câmara vazia não lista lote nenhum"). Então produz 480, transfere 300 para a câmara,
e anota **nova** leitura `-7` → `/ESTAVA NA CÂMARA ÀS \d\d:\d\d/` e `/\d{8}-\d\d/`, com
`page.locator('svg path').count() > 0` para a série da semana. O motivo do instante:
*"A leitura ruim é NOVA, depois da carga: o instante da medição é o que decide quem
estava lá, e é por isso que a lista não é o saldo de agora."*

**19. `the colour bands only exist for an item with a ruler`** (`:1008`) — sem régua,
`/inputs` não pode dizer `/do cheio/`. Cadastra régua no açúcar: "Corrigir o cadastro"
→ `Quanto é "cheio"` = `500000` → "Salvar correção" → **"Confirmar"** (corrigir cadastro
pede confirmação: "é o cadastro que todo custo usa"). Depois exige `/10% do cheio/`.
Nota: o comentário do código diz duas contas diferentes — "46.000 g de saldo contra
500.000 de cheio é 9%" e "50.000 g de saldo contra 500.000 de cheio é 10%"; a asserção
executada é a de **10%**.

**20. `a listed stick leaves the storeroom when the run is recorded`** (`:1038`) — a
checagem com a aritmética mais explícita. Lê o palito na fábrica por
`/Palito de picolé[\s\S]{0,80}?([\d.]+)\s*un/` e exige `antes > 200`. Cria linha
"Picolé" e sabor "Uva" em `/catalog`; cadastra o produto em `/products/new` declarando
o palito (um por unidade). Exige `/O que sai do estoque por unidade/`, `/Quanto de
Palito de picolé por unidade/i`, `/a embalagem listada custa R\$ \d+,\d\d por
unidade/`. E **fecha a conta aberta** — o regex e a aritmética, transcritos:

```js
const conta = listado.match(
  /R\$ ([\d,]+) \| R\$ ([\d,]+) de massa \+ R\$ ([\d,]+) de embalagem do estoque \+ R\$ ([\d,]+) digitado/,
);
const centavos = (texto) => Math.round(Number(texto.replace(',', '.')) * 100);
assert.equal(centavos(conta[1]), centavos(conta[2]) + centavos(conta[3]) + centavos(conta[4]));
```

Depois "Cadastrar produto" → `/Cadastrar este produto\?/` → "Cadastrar", proibindo
`/Não deu para cadastrar/`. Produz 100 unidades de "Picolé de Uva" e exige
`depois === antes - 100` ("cem unidades gastam cem palitos").

**21. `a decimal typed with a dot is the same money as one typed with a comma`**
(`:1133`) — `/purchase`, 2 baldes, `Total da nota` = `120.50`. Exige `/por R\$ 120,50/`;
proíbe `/R\$ 12\.050,00/`. Motivo escrito: *"On Android it is not the person who
chooses: React Native replaces the platform's key listener with one that 'permits all
keyboard input through', so whichever separator the keyboard offers is the one that
arrives."*

**22. `opening a sheet and touching nothing does not change it`** (`:1158`) — a
corrupção que não precisava de teclado. `/recipes` → "Picolé de morango" → `Perda
esperada` = `2,5` → "Salvar como versão" → "Salvar". Reabre de zero e exige
`inputValue() === '2,5'`; proíbe `/25,0%|25%/`. Motivo: *"the screen wrote the loss back
into its own field with `String(2.5)`, read it with a parser that deleted the dot, and
2,5% came back as 25% - with the save button lit and nobody having typed anything."*

**23. `counting is blind, and it is the only way stock goes down`** (`:1189`) —
`/inputs` → "Açúcar cristal" → `/50\.000 g/`. Toca "Conferir estoque" e exige que o
esperado **desapareça**: `assert.ok(!/50\.000 g/.test(blind), 'the expected quantity was
still visible while counting')` e `/escondido enquanto você conta/`. `Quanto tem de
verdade` = `46000` → a confirmação diz tudo: `/Você contou 46\.000 g/`, `/esperava
50\.000 g/`, `/faltando 4\.000 g, que valem R\$ 18,88/`, `/nada é apagado/`. Depois
`/46\.000 g/` e `/conferido em/`.

**24. `what went out today lands on the transport tab, by destination`** (`:1227`) —
`/transport` vazio diz `/Nada saiu hoje ainda/`. Cria loja, transfere 6000 g de açúcar.
A capa **não** pode ganhar manchete de caixa: proíbe `/caixas? saíram hoje/` ("açúcar
não tem caixa, e '0 caixas' seria número falso"). A aba exige `/Loja Centro/`, `/6\.000
g/` **com a unidade** ("a asserção antiga casava só o número, então passava sem a
unidade existir"), `/1 destino/i`, `/Loja Centro ainda não conferiu o que chegou/`.
Conferir é um toque: `/O que chegou em Loja Centro\?/` + `/6\.000 g/` →
"Conferir chegada" → proíbe `/ainda não conferiu/`. Lei 3: exige `/Ontem não saiu
carga|Ontem (foram|foi)/`; e proíbe `/[Pp]rimeira carga/`, porque *"'Primeira carga
registrada' olhava só a janela de ONTEM e nomeava o histórico inteiro: uma fábrica que
entrega há dois anos e não entregou no domingo lia isso na segunda-feira."*

**25. `a store is created, loaded, and the company still has the same sugar`**
(`:1305`) — `/places` exige `/Fábrica/` (nome escrito pela camada de tela, nunca pelo
banco: *"The default place is written with an empty name on purpose"*), `/Açúcar
cristal/`, `/vale R\$/`. Cria loja; `/transfer` exige `/Loja Centro/`, `/Açúcar
cristal/`, `/transferência, não venda/`. `Quanto vai` = `60000` → `/mais do que tem em
Fábrica/` (Lei 5, recusa antes de escrever). `6000` → confirmação `/Você vai mandar
6\.000 g de Açúcar cristal de Fábrica para Loja Centro/` e `/a empresa continua com a
mesma coisa/`. Depois `/Loja Centro/`, `/6\.000 g/`, `/44\.000 g/`, `/sem acordo de
dia/`. Então combina a entrega, e o dia é escolhido **a quatro dias de hoje de
propósito**:

```js
const diaAlvo = (new Date().getDay() + 4) % 7;
const nomeDoDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
  .format(new Date(Date.UTC(2026, 8, 6 + diaAlvo)));
```

Motivo: *"o pedido já oferece hoje, amanhã e depois, então só um dia fora desses três
prova que o acordo virou opção nova… Fixar 'quinta' faria este teste passar ou falhar
conforme o dia em que ele roda."* Preenche `Telefone de quem recebe` = `11 98888-7777`,
salva, e exige `entrega <nomeDoDia>`, `/11 98888-7777/`, ausência de `/sem acordo de
dia/`; e que `/orders/new` passe a oferecer `nomeDoDia`.

**26. `a name can be corrected without moving the money`** (`:1402`) — "Glucose 38DE" →
"Corrigir o cadastro" → `/O preço não é perguntado aqui/` ("it belongs to the
invoices"). Renomeia para "Glucose 38 DE", salva, confirma. Exige `/Glucose 38 DE/` e
`/R\$ 9,80/` ("and the average cost did not move").

**27. `an item can leave circulation without leaving history`** (`:1428`) — "Tirar de
circulação" → "Tirar" → `/Fora de circulação/` e `/R\$ 9,80/`; e `/inputs` deixa de
oferecer: proíbe `/Glucose/`.

**28. `a loss is recorded with its reason, and the report says where the money went`**
(`:1449`) — `/losses` vazio diz `/Nenhuma perda registrada/`. No açúcar: "Registrar
perda" → `Quanto se perdeu` = `4000` → motivo "Venceu" → confirmação `/Você vai baixar
4\.000 g de Açúcar cristal: venceu/` e `/Vale R\$/` ("a perda é dita em dinheiro, não
só em quantidade"). Depois `/46\.000 g/`. E `/losses` exige `/Açúcar cristal/`,
`/4\.000 g · venceu/`, `/O que mais pesou: venceu/`, e
`/primeira janela com perda registrada|nos 30 dias anteriores foram/`.

**29. `two weeks can be planted from Ajustes, and the briefing changes because of it`**
(`:1496`) — capa virgem proíbe `/Mudou desde a última vez/`. `/settings` exige `/Plantar
duas semanas de movimento/` e `/o livro-razão fica com esses lançamentos/`. "Plantar"
duas vezes (a segunda é a confirmação), **espera 9000 ms**, exige `/corridas/` no
resumo, toca "Entendi". A capa passa a dizer `/Mudou desde a última vez/`, `/▲
\d+,\d%|▼ \d+,\d%/` e `/saíram hoje/`. Comentário registra por que a asserção é
positiva: *"A asserção era negativa - 'não fala mais em estabilidade' - e virou
tautologia no dia em que aquela linha saiu da tela: com o cartão removido, ela passaria
mesmo se a capa tivesse ficado muda."*

**30. `a run recorded wrong is corrected by reversal, not by deleting it`** (`:1540`) —
o primeiro escritor de estorno, dirigido de fora. Produz 500; lê `Produzido hoje | N`
por `/Produzido hoje \| ([\d.]+)/` e exige `>= 500`; acha o lote por `/\d{8}-\d{2}/`,
toca, **guarda o endereço da etiqueta** (`page.url()`) — *"depois da correção o lote sai
da lista do dia, e a única maneira de voltar nela é pelo endereço - que é o que o QR da
caixa faz"*. Exige `/Etiqueta do lote/` e `/Corrigir esta corrida/`. Ao corrigir, a
confirmação abre a conta: `/Sai do estoque/`, `/Volta para o almoxarifado/`, `/nada é
apagado/i`. Depois: `feitoDepois < feitoAntes`, o código **sai** da lista do dia, e o
endereço guardado ainda responde com `/Etiqueta do lote/`, `/já foi corrigida/` e
**sem** `/Corrigir esta corrida/` ("estornar duas vezes dobraria a correção, então nem é
oferecido").

**31. `an entry recorded wrong is undone from the item, and the balance comes back`**
(`:1620`) — usa `assentar`. `/inputs` → "Açúcar cristal": `/Últimos lançamentos/`,
`/Compra/`; lê o saldo por `/Em estoque[\s\S]{0,80}?([\d.]+) g/`. Toca "Compra" →
`/Desfazer esta Compra\?/`, `/Sai do estoque/`, `/nada é apagado/i` → "Desfazer". Exige
`saldoDepois < saldoAntes`, `/já corrigido/` na linha original e `/Correção/` como
lançamento novo.

**32. `the app speaks the three languages it was written in, and the money follows`**
(`:1668`) — usa `assentar`. Em `/settings`, com aparelho brasileiro: `/Idioma e moeda/`,
`/Escolha da empresa/`, `/O que está guardado/`, `/BRL · Real/`, `/Peso mexicano/`.
Clica `English`: `/Language and currency/`, `/What is stored/`, ausência de `/O que está
guardado/` ("nada de duas línguas na mesma tela"), `/Mexican peso/`. A escolha sobrevive
a sair: `/inputs` diz `/Storeroom/` e **não** `/Almoxarifado/`; e `/settings` continua
em inglês. Motivo: *"o dicionário tem os três idiomas desde a primeira tela… e até 4 de
setembro nada levava ninguém até dois deles: `useLocale` devolvia uma constante."*

**33. `the app has two faces, and the choice survives leaving the screen`** (`:1713`) —
`/settings`: `/A cara do aplicativo/`, `/Orgânico/`, `/Papel/`. Troca para "Papel",
navega para a capa e volta, e exige que os ajustes sigam de pé e que exista alguma cor
de fundo (`getComputedStyle(document.body).backgroundColor`). Proíbe `/A cor da
paisagem/` no Papel ("o Papel tem uma cara só"); e ao voltar para "Orgânico" exige `/A
cor da paisagem/` e `/Terracota/` ("com as cinco paletas por nome"). **Nota registrada
em `docs/insights.md:2886-2887`: esta asserção de fundo "só afirma que o fundo
*existe*" — verdade de graça.**

**34. `the app opens light even on a phone set to dark, and the light is switchable`**
(`:1754`) — `page.emulateMedia({ colorScheme: 'dark' })` e depois mede **luminância**.
A função `luz()`, transcrita na íntegra porque cada detalhe dela é cicatriz:

```js
const luz = () =>
  page.evaluate(() => {
    let melhor = null;
    let area = 0;
    for (const el of document.querySelectorAll('*')) {
      const cor = getComputedStyle(el).backgroundColor;
      const n = cor.match(/[\d.]+/g);
      if (!n || n.length < 3) continue;
      if (n.length > 3 && Number(n[3]) < 0.9) continue;
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a >= area) { area = a; melhor = n.slice(0, 3).map(Number); }
    }
    if (!melhor) return null;
    return (0.2126 * melhor[0] + 0.7152 * melhor[1] + 0.0722 * melhor[2]) / 255;
  });
```

Duas cicatrizes escritas ao lado: (a) *"A primeira versão desta medida lia
`document.body`, e ele é transparente aqui: a luminância dava 0.00 nos dois temas, e a
checagem teria reprovado sempre — ou, pior, passado sempre se eu tivesse escrito a
comparação ao contrário."* (b) o `>=` em vez de `>`: *"O React Native Web põe uma chapa
cinza fixa (rgb(242,242,242)) do tamanho exato da janela, e a chapa do aplicativo tem a
MESMA área. Com `>` ficava a primeira em ordem de documento, que é a fixa — a medida
dava 0.95 nos dois temas, e a asserção de 'abre claro' passava pelo motivo errado…
Empate se resolve por quem está por cima, que é quem vem depois no documento."*

Os limiares afirmados: inicial `> 0.6` (abre claro com o aparelho no escuro); depois de
"Escuro" `< 0.3`; sobrevive a sair e voltar `< 0.3`; "Claro" de volta `> 0.6`; "Seguir
o aparelho" (com aparelho no escuro) `< 0.3`. E os quatro rótulos: `/A luz da tela/`,
`/Claro/`, `/Escuro/`, `/Seguir o aparelho/`.

**35. `the home is assembled from pieces the house chose`** (`:1840`) — `/settings`: `/O
que aparece na tela inicial/`, `/Produção do dia/`, `/Tempo/`, `/Produção ao vivo/` ("a
produção ao vivo entra na capa por padrão"). Esconde o tempo pelo rótulo de
acessibilidade `/^Tempo: (Esconder|Mostrar)$/` → `/escondido aqui/`, e a capa deixa de
mostrar `/medido às|trocar a cidade/`. Mostra de novo → proíbe `/Tempo · escondido
aqui/`. Exige a seção `/FORA DA CAPA/` com `/Custo por unidade|Dinheiro parado/` ("o que
nasce fora da capa aparece para ser ligado, senão 'quem quiser liga' é uma frase sem
botão"). A capa virgem convida (`/Primeiro dia/`) e proíbe `/Nenhuma corrida registrada
ainda|nada saiu ainda|sem saída registrada/`.

**36. `erasing refuses in an order, and explains the way out`** (`:1909`) — `/settings`
exige duas frases com números derivados: `/Não dá para apagar os insumos enquanto 2
receitas usam eles/` e `/Não dá para apagar as receitas enquanto 1 produto é feito
delas/`. O clique é pelo rótulo de acessibilidade — `getByLabel('Apagar Produtos')` —
porque *"Two rows say 'Produtos' - one counts them, one erases them"*. A confirmação:
`/Apagar produtos\?/`, `/Isso apaga 1 produto/`, `/Isso não tem volta/`.

#### 25.4.10 `scripts/e2e-parallel.mjs` — o fatiamento em quatro, com um export só

Transcrição do docblock (`:2-22`):

> A suíte do navegador em quatro frentes, com um export só.
>
> A espera era o gargalo do dia: `expo export` custa uns dois minutos e as trinta
> checagens em série custavam outros cinco. O export é indivisível — é um empacotamento
> —, mas as checagens não: cada uma abre contexto novo do navegador, com armazenamento
> separado, então fatiar não muda o que nenhuma prova.
>
> O export acontece AQUI, uma vez, imediatamente antes das fatias, e as fatias reusam
> esse `dist`. Essa distinção é o que separa isto do defeito que a própria `flow.mjs`
> documenta: reusar `dist` porque ele existia fazia a suíte testar o pacote de ontem e
> passar verde para uma tela que não tinha a mudança — a pior falha que um teste pode
> ter, porque é idêntica a sucesso. Aqui o pacote é sempre o desta execução; o que se
> evita é empacotar quatro vezes o mesmo código.
>
> Cada fatia sobe o seu próprio servidor numa porta própria, porque o servidor é do
> processo. Uma fatia vermelha derruba a execução inteira: a suíte é um veredito só, e
> "três de quatro fatias passaram" não é um veredito.

Constantes e mecanismo:

| item | valor | linha |
|---|---|---|
| `FATIAS` | `Math.max(1, Math.min(cpus().length, 4))` | `:27` |
| `PORTA_BASE` | `Number(process.env.E2E_PORT ?? 4300)` | `:28` |
| export | `npx expo export --platform web [--clear]`, `--clear` só se `precisaLimpar()` | `:37-43` |
| falha do export | `console.error('\nO export falhou. Sem pacote não há suíte.')` + `process.exit(build.status ?? 1)` | `:44-47` |
| marca | `marcarExportado()` **só depois** do sucesso | `:48-50` |
| filhos | `spawn('node', ['e2e/flow.mjs', '--shard', `${n+1}/${FATIAS}`], { env: {...process.env, E2E_REUSE_BUILD: '1', E2E_PORT: String(PORTA_BASE + n)} })` | `:57-60` |

A agregação (`:69-92`): junta `stdout` e `stderr` de cada filho, imprime **na ordem das
fatias** só as linhas que começam com `  ok`, `  FAIL` ou sete espaços, e soma os
`^(\d+)\/(\d+) passaram` de cada fatia. Fecho:

```
<passaram>/<total> passaram, em <FATIAS> fatias
```

e, se alguma fatia saiu diferente de zero: `<falhou> fatia(s) terminaram vermelhas.` no
`stderr` + `process.exit(1)`.

O comentário do `--clear` daqui carrega a lição operacional (`:31-36`): *"O export daqui
é o único que as quatro fatias enxergam — elas rodam com `E2E_REUSE_BUILD`. Foi por essa
porta que o manifesto velho entrou: a mesma regra escrita no `e2e/flow.mjs` não valia
aqui, que é o caminho que o portão usa de verdade. Regra que vale num caminho e não no
outro é regra que não vale."*

#### 25.4.11 A guarda barata que protege o e2e: `src/selectors.test.ts`

Não é uma das ferramentas do meu escopo, mas é o par indissociável do `e2e`: ela lê
`e2e/flow.mjs` como texto e confere os seletores contra o dicionário, na velocidade da
unidade. Estado: **implementado e chamado** por `npm test`.

O que ela extrai (`src/selectors.test.ts:90-99`):

```js
const LITERAIS = [
  ...FONTE.matchAll(/getByText\('((?:[^'\\]|\\.)+)', \{ exact: true \}\)/g),
  ...FONTE.matchAll(/getByLabel\('((?:[^'\\]|\\.)+)'\)/g),
].map((m) => m[1].replace(/\\'/g, "'"));

const EXPRESSOES = [...FONTE.matchAll(/getBy(?:Label|Text)\(\/((?:[^/\\]|\\.)+)\/\)/g)].map((m) => m[1]);
```

Três testes: (1) todo literal existe no dicionário pt-BR (com `{{marcador}}` trocado por
vazio); (2) toda expressão casa com alguma frase do dicionário; (3) **a lista de
renúncias só guarda renúncia ainda usada**, e cada uma precisa de motivo com mais de 20
caracteres. Guardas de presença antes das comparações: `LITERAIS.length > 20`,
`EXPRESSOES.length > 5`, e `DICIONARIO.length >= 100` (senão lança na carga do módulo).

A lista de renúncias, transcrita por inteiro (`src/selectors.test.ts:73-88`):

| texto | motivo escrito |
|---|---|
| `Picolé de morango` | nome de produto do exemplo semeado, não frase de tela |
| `Açúcar cristal` | nome de insumo do exemplo semeado, não frase de tela |
| `Polpa de morango` | nome de insumo do exemplo semeado, não frase de tela |
| `Apagar Produtos` | rótulo de acessibilidade montado com o nome da área pela tela |
| `Uva` | sabor que a própria checagem cadastra antes de tocar nele |
| `Picolé de Uva` | nome composto pela grade — linha, tipo e sabor — e não escrito em lugar nenhum |
| `máxima` | metade de um rótulo composto na tela do lugar |
| `mínima` | metade de um rótulo composto na tela do lugar |
| `^\d{8}-\d{2}$` | o formato do código do lote, gerado pelo domínio e não traduzido |
| `^Tempo: (Esconder\|Mostrar)$` | rótulo de acessibilidade montado pela capa com o nome da peça mais a ação |
| `English` | nome de idioma escrito NA língua dele, de propósito (traduzir "English" para "Inglês" esconderia a palavra de quem só lê inglês) |

A cicatriz que a criou está em `docs/insights.md:2497` e no docblock: `howMany` deixou
de ser "Quantas {{pack}}" (que saía como **"QUANTAS SACO 25 KG"**) e virou "Quantidade,
em {{pack}}"; três checagens continuaram procurando `/Quantas/`, esperaram trinta
segundos cada, e o CI ficou vermelho vinte minutos depois. E há mutação plantada para
proteger exatamente isso: a **posição 13** da lista do `mutate` reverte o rótulo
(`scripts/mutate.mjs:165-172`).

---

### 25.5 `npm run shot` — a ferramenta de olhar

`node scripts/shot.mjs` (`package.json:18`). Estado: **implementado, chamado à
mão** — não está em nenhum workflow do CI (`.github/workflows/ci.yml` não o menciona) e
não está na barra do `CLAUDE.md`. O `docs/roadmap.md:51-53` afirma o nível de evidência
E3 "com as telas fotografadas nos dois temas e nas duas identidades", que é o produto
desta ferramenta.

#### 25.5.1 Por que existe

`scripts/shot.mjs:1-17`, transcrito:

> Tira foto da tela, para alguém poder OLHAR.
>
> Existe por uma cicatriz de 3 de setembro: entreguei uma capa com cinco cartões dos
> quais quatro não diziam nada, e um desenho com a fábrica, a geladeira e o morango em
> linhas de base diferentes. A suíte inteira estava verde — 283 testes, 70 mutações, 32
> checagens no navegador — porque **nenhuma delas olha para como fica**. Texto passando
> não é tela pronta, e eu afirmei que estava.
>
> Uso:
>   npm run shot                    # capa nas duas caras, instalação virgem
>   npm run shot -- --com-dado      # depois de plantar duas semanas de movimento
>   npm run shot -- --rota /inputs  # qualquer tela
>
> As fotos saem em `.shots/`, que o git ignora: elas são para olhar agora, não para
> versionar.

#### 25.5.2 As bandeiras, todas

| bandeira | leitura no código | efeito |
|---|---|---|
| `--rota <a,b,c>` | `arg('--rota', '/').split(',').map(trim).filter(Boolean)` | uma ou várias rotas separadas por vírgula |
| `--tudo` | `tem('--tudo')` | usa a lista `TODAS`, e liga `comDado` |
| `--com-dado` | `tem('--com-dado') \|\| tudo` | planta duas semanas antes de fotografar |
| `--escuro` | `tem('--escuro')` | esquemas = `['dark']` |
| `--claro` | `tem('--claro')` | esquemas = `['light']` |
| `--largura <px>` | `Number(arg('--largura', '412'))` | largura do viewport; padrão 412 |

Os dois auxiliares (`:45-49`):

```js
const arg = (nome, padrao) => {
  const at = process.argv.indexOf(nome);
  return at >= 0 ? (process.argv[at + 1] ?? padrao) : padrao;
};
const tem = (nome) => process.argv.includes(nome);
```

`PORT` = `Number(process.env.SHOT_PORT ?? 4321)` (`:25`); `ROOT` = `dist` (`:26`);
`SAIDA` = `.shots` (`:27`).

#### 25.5.3 Os dois esquemas e as duas caras: quatro combinações

```js
const esquemas = escuro ? ['dark'] : claro ? ['light'] : ['light', 'dark'];
```
(`:112`) — **as duas luzes por padrão**. E o laço externo cruza esquema × cara:

```js
for (const esquema of esquemas) {
  for (const cara of ['organico', 'papel']) { ... }
}
```
(`:180-181`)

Motivo do padrão ser os dois (`:105-111`): *"Antes era o claro, e o escuro só com
`--escuro`: ver as quatro combinações custava DUAS exportações, e por isso eu olhava
duas e afirmava quatro. O aplicativo tem duas caras e duas luzes; olhar é olhar as
quatro."*

**A luz e a cara são escolhidas DENTRO do aplicativo, não no navegador** (`:260-279`):

```js
if (cara === 'papel' || esquema === 'dark') {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (esquema === 'dark') { await page.getByText('Escuro', { exact: true }).first().click(); await page.waitForTimeout(1200); }
  if (cara === 'papel')  { await page.getByText('Papel',  { exact: true }).first().click(); await page.waitForTimeout(1500); }
}
```

com o motivo escrito: *"`colorScheme` no contexto do navegador parou de valer no dia em
que claro e escuro viraram escolha da empresa com padrão claro (decisão do dono, 4 de
setembro): a foto do escuro saía IGUAL à do claro, e eu teria olhado duas vezes a mesma
tela dizendo que vi as duas. Ferramenta de olhar que mente sobre o que está olhando é
pior que não ter."* (O `colorScheme: esquema` continua sendo passado ao contexto —
`:185` — mas quem decide a foto é o clique nos ajustes.)

#### 25.5.4 A lista `TODAS` — 21 entradas

`scripts/shot.mjs:59-64`, transcrita na ordem exata ("na ordem em que alguém as
encontra"):

```
'/', '/production', 'lote', '/production/new', '/transport', '/transfer',
'/reports', '/places', '/inputs', '/inputs/new', '/purchase',
'/products', '/products/new', '/recipes', '/catalog',
'/orders', '/orders/new', '/losses', '/weather', '/assistant', '/settings'
```

Duas entradas não são endereços e sim caminhos de toque (`:281-297`):

- `'lote'` → vai a `/production`, espera 1200 ms, e clica no primeiro texto que casa
  `/^\d{8}-\d{2}$/` (a etiqueta do primeiro lote do dia).
- `'receita'` → vai a `/recipes`, espera 1500 ms, e clica em `Abrir a tela`. **Nota: a
  entrada `'receita'` é tratada no código mas NÃO está na lista `TODAS`** — só é
  alcançada passando `--rota receita`.

Motivo: *"Telas cujo endereço tem id gerado não se alcançam por URL: chega-se nelas
como uma pessoa chega, tocando."*

Com `--tudo`: 21 rotas × 2 caras × 2 esquemas = **84 fotos** por execução.

#### 25.5.5 O reúso do pacote — e a diferença em relação ao `e2e`

```js
const limpar = precisaLimpar();
if (limpar) console.log('› o app.json mudou: exportando com o cache limpo');

if (!limpar && pacoteServe()) {
  console.log('› o código não mudou desde a última exportação: reusando o pacote');
} else {
  await run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', ...(limpar ? ['--clear'] : [])]);
  marcarExportado();
  marcarPacote();
}
```
(`:144-168`)

**Só o `shot` usa `pacoteServe()`/`marcarPacote()`.** `e2e/flow.mjs` e
`scripts/e2e-parallel.mjs` importam apenas `marcarExportado` e `precisaLimpar`
(`e2e/flow.mjs:7`, `scripts/e2e-parallel.mjs:25`) — o e2e reexporta sempre, salvo
`E2E_REUSE_BUILD`. A diferença é decisão registrada: o reúso por soma de verificação
existe porque *"olhar ficou caro"* (`scripts/manifesto.mjs:56-64`), e o e2e paga a
exportação para nunca testar o pacote de ontem.

#### 25.5.6 A previsão do tempo servida por esta máquina

Duas interceptações de rota (`:209-234`), transcritas com o corpo exato:

`**/api.open-meteo.com/**` responde 200 `application/json`:

```json
{ "daily": {
    "time": ["2026-09-03", "2026-09-04", "2026-09-05"],
    "temperature_2m_max": [31, 33, 29],
    "temperature_2m_min": [19, 20, 18],
    "precipitation_probability_max": [10, 5, 20]
} }
```

`**/geocoding-api.open-meteo.com/**` responde 200 `application/json`:

```json
{ "results": [{ "name": "São Paulo", "admin1": "São Paulo", "latitude": -23.55, "longitude": -46.63 }] }
```

Motivo (`:197-208`): *"Sem isto o cartão do tempo NUNCA aparece nas fotos — a máquina
de desenvolvimento não alcança a Open-Meteo —, e foi por isso que o defeito que o dono
viu passou por mim: o bloco degradê do Orgânico aparecendo no meio da capa de traço do
Papel. Eu fotografava uma capa sem a peça que estava errada. Um dia quente e seco de
propósito: é o caso que desenha sol, que é a forma mais visível da cena."*

#### 25.5.7 A sequência de cada contexto

1. `browser.newContext({ viewport: { width: largura, height: 915 }, deviceScaleFactor:
   2, colorScheme: esquema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })`
   (`:182-194`).
2. Registra as duas interceptações de rede.
3. `goto('/')`, espera 3000 ms.
4. `goto('/weather')`, espera 2000, preenche `Procurar cidade` = `São Paulo`, clica em
   `Procurar cidade` (último), espera 2500, clica no primeiro `São Paulo`, espera 2500.
5. Se `comDado`: `goto('/settings')`, espera 2000, clica `Plantar` (primeiro), espera
   900, clica `Plantar` (último), **espera 9000**. Comentário: *"Plantar pede
   confirmação — a primeira versão desta ferramenta clicava uma vez só e fotografava a
   capa VIRGEM achando que era a capa com dado. Ferramenta de olhar que mente sobre o
   que está olhando é pior que não ter."*
6. Se `papel` ou `dark`: escolhe nos ajustes (25.5.3).
7. Para cada rota: navega (ou toca, para `lote`/`receita`), **espera 3500 ms** ("A capa
   tem animação de entrada; a foto tem de ser depois dela"), e tira
   `page.screenshot({ path, fullPage: true })`.

O contexto é fechado ao fim de cada par (esquema, cara); no `finally` fecha o navegador
e o servidor. Última linha impressa:
`fotos em .shots/ — olhe antes de dizer que está pronto`.

#### 25.5.8 O nome do arquivo, exatamente como é montado

`scripts/shot.mjs:304`:

```js
const nome = `${rota.replace(/\W+/g, '') || 'capa'}-${cara}-${esquema === 'dark' ? 'escuro' : 'claro'}${comDado ? '-com-dado' : '-virgem'}${largura === 412 ? '' : `-${largura}`}.png`;
```

Decomposto:

| pedaço | regra |
|---|---|
| rota | `rota.replace(/\W+/g, '')` — `/` vira `''`, que cai no literal `'capa'`; `/inputs/new` vira `inputsnew` |
| cara | `organico` ou `papel` |
| esquema | `escuro` ou `claro` |
| dado | `-com-dado` ou `-virgem` |
| largura | vazio quando 412; `-<largura>` nos outros casos |

Motivo do sufixo de largura (`:301-303`): *"A largura entra no nome quando não é a
padrão: sem isso a foto estreita sobrescreve a larga, e a comparação entre as duas — que
é o motivo de a largura existir — deixa de ser possível."*

Exemplos reais no disco: `capa-organico-claro-virgem.png`,
`capa-papel-claro-virgem-360.png`, `settings-organico-escuro-com-dado.png`,
`inputsnew-papel-escuro-com-dado.png`.

#### 25.5.9 As três cegueiras consertadas

Registro completo em `docs/insights.md:3473-3499` ("a ferramenta de olhar ficou cega de
três jeitos no mesmo dia"), transcrito:

1. **Idioma.** *"`npm run shot` morreu procurando o campo 'Procurar cidade'. O navegador
   headless é `en-US`, e desde que o idioma virou escolha da empresa — com o aparelho
   como palpite do primeiro dia — o aplicativo abre em inglês ali. A ferramenta parou de
   funcionar por causa de um conserto meu, três horas antes."* Conserto: `locale:
   'pt-BR'` e `timezoneId: 'America/Sao_Paulo'` no contexto (`scripts/shot.mjs:186-193`),
   com o comentário *"O aparelho é BRASILEIRO, dito em vez de herdado."*
2. **Luz.** *"`--escuro` ajustava o `colorScheme` do navegador. O aplicativo passou a
   ter escolha própria, com padrão claro (decisão do dono) — então a foto do escuro saía
   **idêntica à do claro**, e eu teria olhado duas vezes a mesma tela dizendo que vi as
   duas. Esta é a pior das três: a ferramenta não falhou, ela **mentiu**."* Conserto: a
   luz é clicada dentro dos Ajustes (`:268-274`).
3. **Largura.** *"Ela fotografava 412 px e só. O corte que o dono viu — 'Transpo…',
   'Relatóri…' — **não existe a 412**. A 360, que é o Android que uma fábrica de seis
   pessoas compra, ele aparece na primeira foto."* Conserto: `--largura` (`:103`), com o
   comentário *"360 é o Android comum (Moto G, Galaxy A da linha de entrada) — o celular
   que uma fábrica de seis pessoas compra."*

E a regra geral que o insight extrai: *"quando uma preferência deixa de ser do aparelho
e passa a ser do aplicativo, toda ferramenta que dirige o aplicativo de fora fica cega
no mesmo instante — e a cegueira é silenciosa, porque a ferramenta continua produzindo
uma imagem. Idioma, tema e fuso saíram do aparelho hoje; três ferramentas dependiam do
aparelho para configurá-los; nenhuma reclamou."* E: *"instrumento que só olha um tamanho
é cego para todo defeito que depende de tamanho, que é metade dos defeitos de tela."*

Há uma quarta cegueira, anterior, registrada no próprio código (`:248-258`): a versão
que clicava "Plantar" uma vez só e fotografava a capa virgem achando que era a capa com
dado.

---

### 25.6 `npm run folha` — a folha de contato

`node scripts/folha.mjs` (`package.json:19`). Estado: **implementado, chamado à mão**;
não aparece no CI nem na barra.

Docblock (`:1-14`), transcrito:

> A folha de contato das telas: muitas fotos numa imagem só, para comparar.
>
> `npm run shot` responde "esta tela está certa?". Esta responde outra coisa, e é a que
> faltou quando o dono navegou da capa redesenhada para as vinte que não tinham sido:
> **as telas parecem do mesmo aplicativo?** Incoerência não aparece olhando uma de cada
> vez — aparece quando elas estão lado a lado.
>
> Uso:
>   npm run folha                 # tudo o que houver em .shots/
>   npm run folha -- organico-escuro   # só o que casar com o filtro
>
> Sai em `.shots/folha-<filtro>.png`.

Mecanismo:

| passo | detalhe | linha |
|---|---|---|
| filtro | `process.argv[2] ?? ''` | `:20` |
| sem `.shots/` | `console.error('não há .shots/ — rode \`npm run shot -- --tudo\` primeiro')` + `exit(1)` | `:22-25` |
| seleção | `.png`, **não** começando por `folha-`, contendo o filtro, `sort()` | `:27-30` |
| nada casa | `console.error(\`nenhuma foto casa com "<filtro>"\`)` + `exit(1)` | `:32-35` |
| HTML | escrito em `.shots/_folha[-<filtro>].html` | `:59-60` |
| navegador | `chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? ... : undefined, args: ['--no-sandbox'] })` | `:62-65` |
| página | `newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 })` | `:66` |
| saída | `.shots/folha-<filtro \|\| 'tudo'>.png`, `fullPage: true` | `:68-69` |
| fecho | `console.log(\`<n> telas em <saida>\`)` | `:72` |

O CSS da grade, transcrito por inteiro (`:40-52`) — inclusive o comentário que é
decisão:

```css
body { background:#1A1A1A; margin:0; padding:16px; font:11px system-ui; color:#DDD; }
.grade { display:grid; grid-template-columns:repeat(6, 1fr); gap:12px; }
figure { margin:0; }
/* Inteira, não cortada.
   A primeira versão cortava em 420px "porque o topo identifica a tela" — e
   numa folha cujo trabalho é caçar defeito, cortar embaixo é escolher onde
   não olhar. A grade fica desalinhada e tudo bem: desalinhada e completa é
   melhor que arrumada e cega. */
img { width:100%; display:block; border:1px solid #333; background:#000; height:auto; }
.grade { align-items:start; }
figcaption { margin-top:4px; color:#9A9A9A; word-break:break-all; }
```

Seis por linha, cada uma com o nome do arquivo embaixo — *"é o que cabe legível na
largura de uma imagem que ainda dá para ler os títulos das telas"* (`:37-38`).

---

### 25.7 `node scripts/icons.mjs` — os ícones a partir da geometria da marca

Estado: **implementado, sem comando em `package.json`**; roda-se `node
scripts/icons.mjs` (`scripts/icons.mjs:25`). Escreve seis arquivos em `assets/`, e todos
os seis existem no disco.

#### 25.7.1 Por que existe

`scripts/icons.mjs:2-26`, transcrito:

> Os ícones do lançador, desenhados a partir da MESMA geometria da marca.
>
> O `src/config/brand.ts` promete, com todas as letras, que a marca é *"rendered from
> this path on a 100x100 viewBox so every surface — splash, icon, header, print — draws
> the exact same geometry"*. Era verdade em três superfícies e mentira na quarta:
> `assets/icon.png` nunca foi trocado desde o dia em que o projeto nasceu, e o celular do
> dono mostrava o **andaime do Expo** — a seta azul com as linhas-guia de construção
> ainda desenhadas por cima. O aplicativo inteiro numa língua visual, e o quadradinho
> pelo qual ele é aberto falando outra.
>
> Nada de dependência nova: o desenho é um disco com uma cunha tirada, que se rasteriza
> com aritmética, e o PNG sai do `zlib` que já vem no node. Uma ferramenta de imagem a
> mais seria uma coisa a instalar em toda máquina e no CI para desenhar dois círculos.
>
> **Ele recusa o que não entende.** O caminho é lido do `brand.ts` e conferido: as duas
> pontas têm que estar à distância do raio declarado. Se alguém mudar a marca para uma
> forma que este script não sabe desenhar, ele PARA — porque a falha silenciosa aqui é
> desenhar um ícone errado com exit zero, e ninguém confere um ícone que o script disse
> ter escrito.

#### 25.7.2 O que ele lê e as três recusas

Lê `src/config/brand.ts` como texto e extrai com
`new RegExp(\`${chave}:\\s*'([^']+)'\`)`; se a chave não existir, lança
`` brand.ts não declara <chave> — o gerador não inventa marca. `` (`:31-35`). As duas
chaves lidas: `markPath` e `markColorLight` (`:37-38`). Valores atuais
(`src/config/brand.ts:25` e `:32`):

```
markPath:        'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'
markColorLight:  '#2E2B27'
```

A forma aceita, transcrita (`:41`):

```js
const F = String.raw`M([\d.]+),([\d.]+) L([\d.]+),([\d.]+) A([\d.]+),([\d.]+) 0 1,1 ([\d.]+),([\d.]+) Z`;
```

Recusa 1 — o caminho não casa (`:43-48`):

```
markPath mudou de forma e este gerador só sabe "disco com uma cunha":
  <CAMINHO>
Desenhar assim mesmo daria um ícone errado com exit zero, que é pior que não desenhar.
```

Recusa 2 — as pontas não estão no raio (`:51-55`), com tolerância de `0.5`:
`` a <primeira|segunda> ponta do caminho está a <dist> do centro, e o raio declarado é <rx>. ``

Recusa 3 — o arco não é circular (`:56`), tolerância `0.001`:
`o arco não é circular — este gerador só desenha disco.`

#### 25.7.3 A geometria

`[cx, cy, x1, y1, rx, ry, x2, y2]` saem do casamento, nessa ordem. Ângulos em graus:
`ang(x,y) = (Math.atan2(y - cy, x - cx) * 180) / Math.PI`. `de = ang(x1,y1)`;
`varredura = (ang(x2,y2) - de + 360) % 360`. O teste de pertencimento (`:66-69`):

```js
function dentro(x, y) {
  if (dist(x, y) > rx) return false;
  return (ang(x, y) - de + 360) % 360 <= varredura;
}
```

Comentário que explica o sentido (`:58-60`): *"`sweep=1` é sentido horário no sistema do
SVG (y para baixo), então o setor PRESERVADO vai da primeira ponta à segunda nesse
sentido — 305 graus, com a cunha de 55 apontando para o norte."*

Antisserrilhado: `cobertura(x, y, lado, fracao)` com **quatro amostras por lado**
(`N = 4`, 16 por pixel), mapeando o quadrado unitário para o viewBox de 100 por
`u = 50 + ((px - 0.5) * 100) / fracao`. Motivo (`:115-121`): *"Sem isso a borda do disco
sai serrilhada, e um ícone serrilhado é a primeira coisa que alguém nota num lançador."*

O PNG é escrito à mão: assinatura `89 50 4E 47 0D 0A 1A 0A`, blocos `IHDR` (8 bits,
tipo 6 = RGBA), `IDAT` com `deflateSync(bruto, { level: 9 })`, `IEND`; CRC-32 com tabela
gerada em `Int32Array(256)` e polinômio `0xedb88320` (`:71-111`).

#### 25.7.4 Os seis alvos, transcritos

`scripts/icons.mjs:149-156`:

| arquivo | lado | fração | fundo | tinta |
|---|---|---|---|---|
| `assets/icon.png` | 1024 | 0.62 | `#FAF7F2` | `markColorLight` |
| `assets/android-icon-foreground.png` | 1024 | 0.44 | (nenhum, alfa) | `markColorLight` |
| `assets/android-icon-background.png` | 1024 | 0 | `#FAF7F2` | — (fração 0, chapa lisa) |
| `assets/android-icon-monochrome.png` | 1024 | 0.44 | (nenhum, alfa) | `#000000` |
| `assets/splash-icon.png` | 1024 | 0.50 | (nenhum, alfa) | `markColorLight` |
| `assets/favicon.png` | 96 | 0.72 | `#FAF7F2` | `markColorLight` |

Motivo das frações diferentes (`:141-148`): *"`fracao` é quanto do lado o DISCO ocupa, e
cada superfície pede a sua. O ícone do lançador é recortado em círculo pelo sistema,
então a marca respira dentro dele. O primeiro plano adaptativo do Android é pior: o
sistema mexe a camada para o efeito de profundidade e só o miolo de 66% é garantido —
uma marca cheia perde a borda em aparelho nenhum e em outro perde inteira."*

Composição por pixel (`:158-167`): com fundo, `[...mistura(fundo, tinta, a), 255]`;
sem fundo, `[...tinta, Math.round(a * 255)]`, onde
`mistura(fundo, tinta, a) = fundo.map((c,i) => Math.round(c*(1-a) + tinta[i]*a))`.

Saída impressa: uma linha por alvo, `<arquivo>  <lado>px  <KB> KB`, e no fim:

```
A cunha é de <(360 - varredura).toFixed(1)>°, apontando para o norte, tirada do brand.ts.
```

#### 25.7.5 A lição registrada sobre julgar ícone

`docs/insights.md:3516-3533`: *"o ícone de 'Produção' — o picolé num aplicativo que
promete servir qualquer fábrica — levou **três desenhos** para ficar de pé, cada um
reprovado por uma foto da barra de abas: três unidades empilhadas viraram irmãs do ícone
de 'Mais'; unidade sobre esteira com roletes virou irmã do caminhão. **Ícone não se
julga sozinho: ele se julga na fileira em que vai viver.** O primeiro parecia ótimo
isolado."*

---

### 25.8 `scripts/manifesto.mjs` — a biblioteca das duas somas

Estado: **implementado e chamado** — importado por `e2e/flow.mjs:7`,
`scripts/e2e-parallel.mjs:25` e `scripts/shot.mjs:23`. Não tem comando próprio.

#### 25.8.1 As quatro funções exportadas

| função | assinatura | o que faz |
|---|---|---|
| `precisaLimpar` | `(raiz = process.cwd()) => boolean` | verdadeiro quando o SHA-256 de `app.json` difere do guardado em `.expo/manifesto.sha` |
| `marcarExportado` | `(raiz = process.cwd()) => void` | grava esse SHA-256, **só depois** de uma exportação bem-sucedida |
| `fonteDoPacote` | `(raiz = process.cwd()) => string` | SHA-256 de tudo o que entra no pacote |
| `pacoteServe` | `(raiz = process.cwd()) => boolean` | verdadeiro quando `dist/index.html` existe e `.expo/fonte.sha` bate com `fonteDoPacote()` |
| `marcarPacote` | `(raiz = process.cwd()) => void` | grava `fonteDoPacote()` em `.expo/fonte.sha` |

`precisaLimpar` devolve `false` quando não existe `app.json` (`:31`). `marcarExportado`
não faz nada nesse caso (`:42`).

#### 25.8.2 O que entra na soma do pacote

`scripts/manifesto.mjs:66-86`. Percorre recursivamente, em ordem alfabética
(`readdirSync(dir).sort()`), as pastas `app`, `src`, `assets`; e depois os arquivos
`app.json`, `package.json`, `babel.config.js`, `metro.config.js`. Para cada arquivo,
`hash.update(caminho).update(readFileSync(caminho))` — o caminho entra na soma, não só o
conteúdo. Exclusão: `if (entrada === 'node_modules' || entrada.startsWith('.'))
continue`, com o motivo escrito: *"O que o Metro não olha, esta soma também não: pastas
geradas e o próprio pacote entrariam na conta e a soma nunca fecharia."*

#### 25.8.3 A cicatriz do manifesto velho

`scripts/manifesto.mjs:8-27`, transcrito:

> **A cicatriz.** A tela de Ajustes escreve a versão do aplicativo no cabeçalho, lendo
> `Constants.expoConfig.version`. Numa revisão de rotina ela apareceu dizendo `0.2.0` —
> cinco versões atrás do `app.json`, que dizia `0.7.0`. O `expo config` resolvia `0.7.0`
> corretamente; quem estava velho era o PACOTE.
>
> O manifesto inteiro é embutido no `expo-constants` na hora de transformar o módulo, e o
> cache do Metro tem como chave o conteúdo do arquivo transformado — que não muda quando
> o `app.json` muda. Então o pacote sai fresco com o manifesto velho, em silêncio, e
> continua assim para sempre.
>
> O custo disso não é a versão errada num canto: é que as duas ferramentas de olhar deste
> repositório — `npm run shot` e o `e2e` — liam esse pacote. É a mesma família do `dist`
> reusado "porque ele existia", que já fez a suíte passar verde para uma tela que não
> tinha a mudança; um nível abaixo, e mais difícil de ver, porque aqui a exportação É da
> execução.
>
> **Por que não limpar sempre.** A espera do portão já foi medida e encolhida de
> propósito, e a exportação é a parte cara: limpar o cache em toda execução devolveria o
> minuto que custou trabalho para ganhar. E não é preciso — o manifesto só envelhece
> quando o `app.json` muda, então a marca é ele.

A versão do `app.json` hoje é `0.10.0`, e é ela que a checagem 6 do e2e exige na tela de
Ajustes. A regra geral extraída em `docs/insights.md:2431-2434`: *"cache invisível é
cache que mente. Quando um dado nasce fora dos arquivos que o cache tem como chave — um
manifesto, uma variável de ambiente, um relógio —, alguma coisa no produto final tem que
dizer esse dado em voz alta, para uma asserção poder compará-lo com a fonte."*

#### 25.8.4 A cicatriz do reúso, e a distinção que salva

`scripts/manifesto.mjs:49-65`, transcrito:

> O pacote pode ser reusado quando o CÓDIGO é o mesmo — e só então.
>
> A cicatriz do reúso está escrita acima e continua valendo: reusar `dist` **porque ele
> existia** já fez uma suíte passar verde para uma tela que não tinha a mudança. Mas
> "porque existia" e "porque é o mesmo código" são coisas diferentes, e a diferença é uma
> soma de verificação.
>
> Isto existe porque olhar ficou caro. Cada `npm run shot` exporta o aplicativo inteiro
> (perto de um minuto e meio), e refazer um desenho pede dez olhadas: a ferramenta de
> olhar cobrava quinze minutos de espera para quinze segundos de conserto, e ferramenta
> cara é ferramenta que não se usa — que é como a capa foi publicada com um degradê cor
> de lama.
>
> A soma cobre tudo o que entra no pacote: as telas, o código, os desenhos, o manifesto e
> as dependências declaradas. Qualquer um deles diferente, exporta.

---

### 25.9 Como cada ferramenta entra no CI

`.github/workflows/ci.yml` tem quatro jobs, e o comentário de abertura diz por que é a
mesma barra local (`:3-8`): *"The bar every push has to clear. It is deliberately the
same one a person runs locally - a check that only exists in CI drifts from what
contributors actually do, and then nobody trusts either of them."* Dispara em `push` para
`main` e em todo `pull_request` — e não nos dois para o mesmo commit, *"which costs
minutes and makes a red check ambiguous about which run it belongs to"*.

| job | nome | passos, na ordem |
|---|---|---|
| `app` | types, tests, bundle | `npm ci` · `npm run typecheck` · `npm run lint` · `npm test` · **`npm run mutate`** ("Does the suite bite?") · `npx expo export --platform android` com `EXPO_NO_TELEMETRY=1` |
| `gate` | proofgate | checkout com `fetch-depth: 0` · `npm ci` · `bash .proofgate/verify.sh` |
| `browser` | the app, driven the way a person drives it | `npm ci` · `npx playwright install --with-deps chromium` · **`npm run e2e`** com `EXPO_NO_TELEMETRY=1` |
| `schema` | the database keeps its promises | `npm ci` · localiza binários do Postgres · `npm run db:verify` |

Três observações de fato:

- **O CI roda `npm run e2e`, não `npm run e2e:fast`** (`ci.yml:93`). O fatiamento é para
  a máquina de quem trabalha.
- **`npm run shot`, `npm run folha` e `scripts/icons.mjs` não estão em nenhum job.** O
  olhar é humano e manual, por construção.
- O nome do último passo do job `schema` diz "Six guarantees" (`ci.yml:121`) enquanto o
  `docs/roadmap.md:48` e o `CLAUDE.md` falam de **treze**. O `src/bar.test.ts` confere o
  número no `CLAUDE.md` e no próprio script, **não** no nome do passo do workflow — então
  esse rótulo envelheceu sem que nada reprovasse.
- O comentário do job `gate` diz "Nineteen guards over the diff itself" (`ci.yml:67`)
  enquanto `docs/roadmap.md:49` diz **24 guardas de entrega**. Mesma família de rótulo
  não conferido.

---

### 25.10 A guarda que confere os números destas ferramentas: `src/bar.test.ts`

Estado: **implementado e chamado** por `npm test`. Ela existe para impedir que o número
que o projeto afirma sobre si mesmo envelheça, e três das suas dez linhas são sobre as
ferramentas desta seção.

A tabela `TABELA` (`src/bar.test.ts:121-132`), transcrita, com a derivação de cada linha:

| rótulo no `docs/roadmap.md` | como o número é derivado do sistema |
|---|---|
| `telas` | `.tsx` sob `app/` que não comecem com `_layout` |
| `tabelas no aparelho (SQLite)` | `CREATE TABLE IF NOT EXISTS` em `src/data/db.ts` |
| `tabelas no servidor (Postgres)` | `^create table` em todos os `supabase/migrations/*` |
| `migrações do servidor` | `readdirSync('supabase/migrations').length` |
| `papéis` | chaves de `ROLES` em `src/domain/access.ts` |
| `capacidades` | `Set` de `'[a-z_]+'` em `src/domain/access.ts` |
| `` `npm test` `` | soma de `^test(` em todo `*.test.ts` sob `src/` |
| `` `npm run mutate` `` | `^ {4}file: '` em `scripts/mutate.mjs` |
| `` `npm run e2e:fast` `` | `^check(` em `e2e/flow.mjs` |
| `` `npm run db:verify` `` | `^echo "==> check ` em `scripts/verify-migrations.sh` |

Os valores registrados no plano ficam **no plano** (`docs/roadmap.md`, a tabela *"onde o
produto está hoje"*), e não são repetidos aqui de propósito.

**Esta seção trazia a cópia deles, e ela envelheceu em silêncio até 11 de setembro** —
dizia 338 testes quando o sistema tinha 711, e 13 garantias quando tinha 29. A guarda
acima confere o plano contra o código; ninguém confere uma cópia da tabela dentro de outro
documento, então a cópia é a única das três que pode mentir sem reprovar nada. É a mesma
regra que o `CLAUDE.md` aplica aos traços da pele: *"não copie os nomes para cá, porque a
cópia envelhece"*.

**E a cópia carregava um erro que não era só de número:** ela dizia que as garantias do
`db:verify` rodam *"sob RLS"*, e são duas provas diferentes. Quinze rodam como a conta da
empresa, sob RLS, e provam **aceitação** — o servidor deixa esta conta escrever isto? As
outras quatorze rodam como dono do banco e provam **impossibilidade** — nem o dono quebra
o gatilho, a restrição, a chave composta. A segunda é mais forte que a primeira, e é o que
o razão precisa: `DELETE` em `movements` é recusado até para o dono do banco. Dizer "tudo
sob RLS" enfraquece o que é forte e exagera o que é fraco, ao mesmo tempo.

E a fronteira honesta desta guarda, escrita nela (`:113-119`): *"Acrescentar uma linha à
tabela sem acrescentar uma entrada aqui não quebra nada — e essa é a fronteira honesta
desta guarda: ela confere o que foi registrado, não descobre o que não foi."*

---

### 25.11 Duas regras de operação que valem para estas ferramentas

Ambas de `CLAUDE.md`, e ambas cicatriz:

> - **Nunca mate processo por padrão.** Um `pkill` largo nesta sessão matou a verificação
>   que tinha acabado de ser disparada — inclusive a nova, junto com a velha. Se precisar
>   parar algo, pare pelo PID que você mesmo anotou.
> - **`import()` não é checagem de sintaxe: ele RODA o arquivo.** Usei
>   `node -e "import('./scripts/mutate.mjs')"` duas vezes para ver se a edição tinha
>   quebrado a sintaxe, e as duas vezes o script inteiro começou a rodar. Com `&` no fim
>   do comando, ele ainda ficou **órfão** (`ppid 1`), fora de qualquer árvore que eu fosse
>   olhar depois. Um deles rodou a suíte de mutação por **oito horas** numa máquina de
>   quatro núcleos, roubando CPU da auditoria e produzindo fatias vermelhas no `e2e` que
>   eu diagnostiquei como disputa — o que era verdade, e não era a causa. Sintaxe se
>   confere com `node --check arquivo.mjs`, que valida e não executa.

E a terceira, que é sobre não disputar a própria medida (`docs/insights.md:3266-3271`):
*"Eu criei a contenção que produziu o falso alarme rodando a suíte enquanto a bateria
rodava… Rodar a suíte enquanto a bateria roda a suíte 98 vezes não é trabalhar em
paralelo: é disputar a própria medida. O que dá para fazer enquanto a barra roda é
documento e leitura, e nada que peça CPU."*

---

### 25.13 `npm run dossie` — o dossiê montado por script

`scripts/dossie.mjs`, 60 linhas. **Implementado e chamado**, por `npm run dossie`
(`package.json:20`). Docblock transcrito (`scripts/dossie.mjs:1-17`):

> *"Monta `docs/DOSSIE.md` a partir das seções de `docs/dossie/`. O dossiê existe
> porque este repositório ia ser apagado e o que se perde num apagamento não é o
> código — é a razão de cada decisão, que aqui morava em docblock, em nome de
> migração e em `docs/insights.md`. As seções são a fonte e ficam versionadas uma
> por arquivo; o arquivo único é derivado e NÃO entra no git, por dois motivos
> concretos: ele passa de 3 MB, e o GitHub não renderiza markdown desse tamanho —
> mostra o texto cru ou trunca. As seções soltas, de 50 a 200 KB cada, abrem no
> navegador normalmente. Quem quer o arquivo único quer para dar `grep` ou para
> entregar a outra ferramenta, e para isso ele se monta em meio segundo com este
> script. Ordem: `00-` é a capa e vem antes do sumário; `01-` a `35-` são as
> seções; `90-` para cima são os apêndices verbatim."*

Consequências operacionais, para quem reconstruir:

- **O número no nome do arquivo é o contrato de ordenação.** O filtro é
  `/^\d\d-.+\.md$/` e a ordem é `sort()` de string — por isso os apêndices começam
  em `90`, e não em `36`: deixa espaço para seções novas sem renomear nada.
- **A capa `00-*` é obrigatória.** Sem ela o script lança
  `docs/dossie não tem a capa 00-*.md` em vez de montar um documento sem começo.
- **Ele recusa duas coisas em vez de produzir documento quebrado:** seção sem título
  de nível 2, e cerca de código em número ímpar. A segunda é cicatriz: um apêndice de
  markdown foi envolvido em ``` tendo ``` dentro, e a cerca interna fechou a externa —
  metade do apêndice virou texto e a outra metade sumiu dentro de um bloco de código.
- **A âncora do sumário imita a do GitHub:** minúsculas, sem acento (`NFD` + remoção
  de diacríticos), só letras, dígitos, espaço e hífen, espaços viram hífens.
- `docs/DOSSIE.md` está no `.gitignore` com o motivo escrito na linha acima dele.

---

### 25.12 O que NÃO está no código

- **Tempo medido para as contagens atuais.** A tabela antes/depois do `CLAUDE.md` foi
  medida com 64 mutações e 30 checagens; não há medida registrada para 106 e 36. NÃO ESTÁ
  NO CÓDIGO.
- **Qual é a duração real de `expo export`.** Três valores diferentes estão escritos em
  três arquivos (dois, quatro, e um e meio minutos). Qual está certo: NÃO ESTÁ NO CÓDIGO.
- **Comparação automática de imagem.** Nem `shot` nem `folha` comparam foto com foto ou
  com referência; não há teste de regressão visual. NÃO IMPLEMENTADO.
- **`npm run folha` no CI.** NÃO IMPLEMENTADO — e não existe artefato de foto publicado
  por nenhum workflow.
- **Comando `icons` em `package.json`.** NÃO IMPLEMENTADO; o gerador roda à mão e nada
  confere se `assets/*.png` está em dia com `src/config/brand.ts`.
- **A rota `receita` na lista `TODAS` do `shot`.** O código sabe alcançá-la
  (`scripts/shot.mjs:287-290`) e a lista não a inclui (`:59-64`) — implementado, mas só
  alcançável por `--rota receita`.
- **`--largura` no `e2e` e na `folha`.** Só o `shot` tem largura configurável; o e2e é
  fixo em 412×915 e a folha em 1500×1000. NÃO IMPLEMENTADO.
- **Paralelismo no `shot`.** As 84 fotos de `--tudo` saem em série, num navegador só.
  NÃO IMPLEMENTADO.
- **Nova medida de `assentar` cobrindo todas as checagens.** Três checagens usam
  `assentar`; as outras 33 usam `waitForTimeout`. A migração não está feita.
- **Rerrodada automática de checagem de e2e que falhou.** O `mutate` tem segunda chance
  para `inconclusivo`; o `e2e` não tem nada equivalente. NÃO IMPLEMENTADO.
