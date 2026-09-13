#!/usr/bin/env bash
# Guard: a hard-coded local machine path in the diff.
# The scar: `/home/alice/project/...` or `/Users/bob/...` or `C:\Users\...` baked
# into code or config works on exactly one laptop and breaks in CI, in the
# container, and for every teammate. WARN. Container-idiom users (node/app/runner/
# deploy/…) and Dockerfiles/CI workflows are excluded — those paths are legitimate.
set -uo pipefail
# shellcheck source=/dev/null
. "${PROOFGATE_LIB:-$(dirname "$0")/../lib.sh}" 2>/dev/null || true
# O caminho tem que COMEÇAR no /: sem isso, `src/home/capas/...` é acusado de ser
# o diretório pessoal de alguém — uma pasta chamada `home` dentro do projeto casa
# com `/home/<nome>/` e o guarda fica amarelo para sempre por causa do nome de uma
# pasta. Antes do `/` só pode vir começo de linha, aspas, espaço ou pontuação —
# nunca outro pedaço de caminho.
#
# E o `@` entra nessa lista, porque o conserto acima não alcançava a forma que este
# projeto usa: `import … from '@/home/capas/vestimenta'`. O apelido de módulo `@/`
# é pontuação para a régua antiga, então `@/home/capas/` casava e a guarda ficava
# amarela para sempre — pelo nome de uma pasta, que é exatamente o que o parágrafo
# acima diz ter resolvido. Docblock que nomeia o defeito não o impede.
PAT='(^|[^A-Za-z0-9_.@-])(/home/[a-z_][a-z0-9_-]*/|/Users/[^/[:space:]"'"'"']+/)|[A-Z]:\\Users\\'  # proofgate-allow
KEEP='/home/(node|app|runner|deploy|user|ubuntu|vscode|www-data)/'          # proofgate-allow
tab="$(printf '\t')"; n=0
while IFS="$tab" read -r file content; do
  printf '%s' "$content" | grep -Eq "$KEEP" && continue          # container-idiom path — legitimate
  pg_ignored "$(pg_fingerprint machine-paths "$file" "$content")" && continue
  n=$((n + 1))
done < <(pg_added_with_file ':(exclude)*.md' ':(exclude)*Dockerfile*' ':(exclude)*.github/*' ':(exclude)*.gitlab-ci*' \
  | pg_match "$PAT")
if [ "$n" -gt 0 ]; then
  echo "⚠️  machine-paths: $n added line(s) hard-code a local machine path (/home/<you>, /Users/<you>, C:\\Users\\). It works on one box only — use a relative path or an env var."
  exit 2
fi
echo "✅ machine-paths: no local machine paths hard-coded"
exit 0
