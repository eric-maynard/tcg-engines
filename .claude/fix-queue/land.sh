#!/usr/bin/env bash
# Deterministic "land" step for the fixer: gates → commit → push → sync → bounce.
# Usage: land.sh <round-label> "<commit message>"     (no other inputs; nothing here is LLM-composed shell)
set -uo pipefail
REPO=/root/src/tcg/tcg-engines; cd "$REPO"
LABEL="${1:-rX}"; MSG="${2:-fix(queue $LABEL)}"
LABEL="$(printf '%s' "$LABEL" | tr -cd 'A-Za-z0-9_-' | cut -c1-24)"
out() { printf '%s=%s\n' "$1" "$2"; }
if grep -rl '^<<<<<<<\|^>>>>>>>' packages apps --include='*.ts' --include='*.js' 2>/dev/null | grep -v node_modules | grep -q .; then out conflict_markers yes; out committed false; exit 0; fi
for f in $(git ls-files -m 'apps/riftbound-app/public/js/**/*.js'); do node --check "$f" >/dev/null 2>&1 || { out js_syntax "FAIL:$f"; out committed false; exit 0; }; done
ENG=$(bun test packages/riftbound-engine/src/__tests__/ 2>&1 | tail -4 | tr '\n' ' ')
out engine_tests "$ENG"
echo "$ENG" | grep -q ' 0 fail' || { out committed false; exit 0; }
PAR=$(bun test packages/riftbound-cards/src/parser/__tests__/ 2>&1 | tail -3 | tr '\n' ' ')
out parser_tests "$PAR"
echo "$PAR" | grep -q ' 0 fail' || { out committed false; exit 0; }
rm -rf "/tmp/pt-$LABEL"; bun packages/riftbound-engine/src/testing/playtest/game-tracer.ts --games 20 --max-turns 40 --out "/tmp/pt-$LABEL" --seed "$LABEL" >/dev/null 2>&1
out tracer "$(bun packages/riftbound-engine/src/testing/playtest/coverage-check.ts "/tmp/pt-$LABEL" 2>/dev/null | grep -E '"moveFailed"|"costViolations"' | tr -d ' \n')"
git add -A ':!apps/riftbound-app/data/'
if git diff --cached --quiet; then out committed false; out reason nothing_staged; else
  git commit -q -m "$MSG" && out committed true && out sha "$(git rev-parse --short HEAD)"
  GIT_TERMINAL_PROMPT=0 git push origin HEAD 2>&1 | tail -1 | sed 's/^/push=/'
fi
rsync -a --delete packages/ emaynard-tcg:/root/tcg/tcg-engines/packages/ --exclude node_modules && rsync -a apps/riftbound-app/ emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/ --exclude data --exclude node_modules --exclude downloads && out synced true
out app "$(ssh -o ConnectTimeout=10 emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play' 2>/dev/null)"
