#!/usr/bin/env bash
# Recusa comando que ESPERA em vez de trabalhar.
#
# Por que isto existe, e por que é um script e não um conselho.
#
# Em 3 de setembro um `import()` deixou a suíte de mutação órfã por oito horas,
# roubando CPU de tudo. A lição virou linha no CLAUDE.md. Em 5 de setembro eu
# escrevi
#
#     until ! pgrep -f "e2e/flow.mjs"; do sleep 10; done; npm run e2e
#
# — laço em que o `pgrep -f` casa com a linha de comando do PRÓPRIO shell, que
# contém aquele texto. Ele esperou a si mesmo por 1h03 e não chegou a disparar
# nada. O dono viu no painel dele e perguntou por que demorava; depois foi direto
# ao ponto: *"não é a primeira vez que você fica esperando essas tarefas bugadas.
# se torne imune a isso."*
#
# Imune não é lembrar melhor. Conselho eu esqueço na próxima sessão — é a mesma
# frase que criou a proofgate. O que impede é a coisa não rodar.
#
# O caminho certo já existe e é mais curto: dispare em segundo plano e siga
# trabalhando, que a notificação de término chega sozinha.
#
# Sai com 2 para BLOQUEAR e devolver o motivo. Desliga com NORVA_ESPERA_OFF=1.
set -uo pipefail

[ -n "${NORVA_ESPERA_OFF:-}" ] && exit 0

entrada=$(cat)
comando=$(printf '%s' "$entrada" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if d.get("tool_name") != "Bash":
    sys.exit(0)
print(d.get("tool_input", {}).get("command", ""))
' 2>/dev/null) || exit 0

[ -z "$comando" ] && exit 0

# O corpo de um heredoc é TEXTO, não comando — e o guarda reprovou a si mesmo na
# estreia: o commit que o introduziu cita o laço dentro de um `<<'FIM'`, e ele leu
# a citação como o crime. Guarda que confunde falar de uma coisa com fazê-la é o
# `debug-allow` da proofgate outra vez. Aqui o corpo sai antes de qualquer busca.
comando=$(printf '%s' "$comando" | python3 -c '
import re, sys
linhas = sys.stdin.read().split("\n")
saida, fim = [], None
for l in linhas:
    if fim is not None:
        if l.strip() == fim:
            fim = None
        continue
    saida.append(l)
    for m in re.finditer(r"<<-?\s*[\x27\"]?([A-Za-z_][A-Za-z0-9_]*)[\x27\"]?", l):
        fim = m.group(1)
print("\n".join(saida))
')

# E o que está DENTRO de aspas é argumento, não comando.
#
# Segunda reprovação do guarda contra ele mesmo, na mesma hora: a prova negativa
# passa os comandos ruins como argumento (`testar 'until ...'`), e ele leu o
# argumento como o crime. A busca dos laços passa a rodar sobre o comando com os
# trechos entre aspas apagados — o laço de verdade tem `until`, `do` e `sleep`
# FORA de aspas, então ele continua sendo pego; a citação, não.
sem_aspas=$(printf '%s' "$comando" | python3 -c '
import re, sys
texto = sys.stdin.read()
print(re.sub(r"\x27[^\x27]*\x27|\"[^\"]*\"", " ", texto))
')

recusa() {
  printf '%s\n' "$1" >&2
  printf '%s\n' "  → Dispare o trabalho com run_in_background e siga para a próxima coisa." >&2
  printf '%s\n' "     A notificação de término chega sozinha. (NORVA_ESPERA_OFF=1 desliga.)" >&2
  exit 2
}

# 1. Laço de espera: `until`/`while` com `sleep` dentro.
if printf '%s' "$sem_aspas" | grep -Eq '\b(until|while)\b[^;]*(;|\bdo\b)' &&
   printf '%s' "$sem_aspas" | grep -Eq '\bsleep\b'; then
  recusa "✗ laço de espera. Este é o comando que ficou 1h03 esperando a si mesmo."
fi

# 2. `pgrep`/`pkill -f` cujo padrão está na PRÓPRIA linha: casa consigo e nunca termina.
alvo=$(printf '%s' "$comando" | grep -oE 'p(grep|kill)[^|;&]*-f[[:space:]]+"[^"]+"' | head -1 |
       sed -E 's/.*-f[[:space:]]+"([^"]+)"/\1/')
if [ -n "$alvo" ]; then
  resto=$(printf '%s' "$comando" | sed -E 's/p(grep|kill)[^|;&]*-f[[:space:]]+"[^"]+"//g')
  if printf '%s' "$resto" | grep -qF -- "$alvo"; then
    recusa "✗ o padrão \"$alvo\" aparece no próprio comando: o pgrep casa com este shell."
  fi
fi

# 3. Espera longa em primeiro plano: meio minuto parado é meio minuto sem trabalhar.
if printf '%s' "$sem_aspas" | grep -Eq '\bsleep[[:space:]]+([3-9][0-9]|[0-9]{3,})\b'; then
  recusa "✗ sleep longo em primeiro plano."
fi

# 4. `nohup ... &`: o processo fica órfão em ppid 1, fora de qualquer árvore que
#    alguém vá olhar depois. Foi assim que a mutação rodou oito horas escondida.
if printf '%s' "$sem_aspas" | grep -Eq '\bnohup\b.*&[[:space:]]*($|[;|])'; then
  recusa "✗ nohup em segundo plano deixa processo órfão, fora de toda árvore."
fi

# 5. Verificação e AÇÃO na mesma linha: o veredito não porta nenhuma delas.
#
# Em 6 de setembro rodei `bash .proofgate/verify.sh | grep ... && git push`. O
# portão imprimiu "❌ GATE FAILED" e o push saiu do mesmo jeito — porque quem
# governava o `&&` era o código de saída do `grep`, que achou a linha e por isso
# teve sucesso. Empurrei uma suíte vermelha e o CI ficou vermelho atrás.
#
# O defeito não é ter esquecido de olhar: eu OLHEI, e a saída estava na tela ao
# lado do push que já tinha acontecido. Encadear é que estava errado — a leitura
# tem que caber entre uma coisa e outra, e num `&&` não cabe.
#
# (O `pushGuard` da proofgate cobria isto e está desligado por decisão do dono de
# 5 de setembro, com motivo escrito no `proofgate.json`: com a barra
# proporcional, ele bloqueava commit de ambiente e de documento. Isto aqui é mais
# estreito de propósito — não exige veredito nenhum, só recusa a mistura.)
if printf '%s' "$sem_aspas" | grep -Eq 'verify\.sh|npm (run )?(test|typecheck|lint|e2e|db:verify|mutate)' &&
   printf '%s' "$sem_aspas" | grep -Eq '\bgit[[:space:]]+push\b'; then
  printf '%s\n' "✗ verificação e \`git push\` no mesmo comando: quem decide o \`&&\` é o último cano," >&2
  printf '%s\n' "  não o veredito. Um portão vermelho já passou por aqui e o push saiu junto." >&2
  printf '%s\n' "  → Rode a verificação, LEIA a saída, e empurre depois, num comando separado." >&2
  printf '%s\n' "     (NORVA_ESPERA_OFF=1 desliga.)" >&2
  exit 2
fi

# 6. A barra POR CIMA do navegador: quatro fatias já ocupam os quatro núcleos.
#
# O `CLAUDE.md` diz isto desde 9 de setembro, com a medida ao lado: uma checagem que perde
# a corrida devolve `Input: ''` — sinal de queda, não de frase errada — e passa verde
# sozinha depois. Em 11 de setembro eu quebrei a regra QUATRO vezes na mesma sessão,
# sabendo dela, e três execuções voltaram com vermelha que não era defeito. Cada uma custou
# a execução inteira (seis a nove minutos) mais a remedição de uma checagem por vez.
#
# Atenção não conserta: é a mesma conclusão que criou este gancho.
#
# A marca é o PID que o corredor anotou (`scripts/e2e-parallel.mjs`), e não um `pgrep -f`
# por padrão — aquele casa com a linha de comando de quem procura, defeito que este
# repositório já pagou duas vezes. Marca de execução morta não bloqueia: a liveness do PID
# é conferida aqui.
if printf '%s' "$sem_aspas" | grep -Eq 'npm (run )?(test|typecheck|lint|mutate|db:verify)|npx tsx --test|tsc --noEmit'; then
  marca=".e2e-rodando"
  if [ -f "$marca" ]; then
    dono=$(tr -d '[:space:]' < "$marca" 2>/dev/null || true)
    if [ -n "$dono" ] && kill -0 "$dono" 2>/dev/null; then
      printf '%s\n' "✗ o navegador está rodando (PID $dono) e a barra disputaria os quatro núcleos." >&2
      printf '%s\n' "  Checagem que perde a corrida devolve \`Input: ''\` e passa sozinha depois — a" >&2
      printf '%s\n' "  execução inteira se perde, e a remedição custa mais que a espera." >&2
      printf '%s\n' "  → Espere a notificação de término e rode depois." >&2
      printf '%s\n' "     (NORVA_ESPERA_OFF=1 desliga.)" >&2
      exit 2
    fi
  fi
fi

exit 0
