#!/usr/bin/env bash
# Deterministic "land" step: gates → commit → push → sync → bounce.
# Usage: land.sh <label> "<commit message>"
# Gate policy: the engine suite may only fail inside UNTRACKED test files (other lanes' in-progress
# work). Those files are left unstaged; everything else is committed. Any failure in a tracked test
# file blocks the commit.
set -uo pipefail
REPO=/root/src/tcg/tcg-engines; cd "$REPO"
LABEL="$(printf '%s' "${1:-rX}" | tr -cd 'A-Za-z0-9_-' | cut -c1-24)"; MSG="${2:-fix(queue $LABEL)}"
out() { printf '%s=%s\n' "$1" "$2"; }
if grep -rl '^<<<<<<<\|^>>>>>>>' packages apps --include='*.ts' --include='*.js' 2>/dev/null | grep -v node_modules | grep -q .; then out conflict_markers yes; out committed false; exit 0; fi
for f in $(git ls-files -m 'apps/riftbound-app/public/js/**/*.js'); do node --check "$f" >/dev/null 2>&1 || { out js_syntax "FAIL:$f"; out committed false; exit 0; }; done
LOG=$(mktemp); bun test --path-ignore-patterns "**/do_not_commit/**" packages/riftbound-engine/src/__tests__/ >"$LOG" 2>&1 || true
# (bun <1.2 lacks --path-ignore-patterns; fall back by filtering do_not_commit failures below)
out engine_tests "$(tail -4 "$LOG" | tr '\n' ' ')"
# Map failing tests → files. bun prints "(fail) Describe > test"; file headers precede as "path:".
FAILFILES=$(awk '/^packages\/.*\.test\.ts:$/{f=$0; sub(/:$/,"",f)} /^\(fail\)/{print f}' "$LOG" | sort -u)
UNTRACKED=$(git ls-files --others --exclude-standard 'packages/riftbound-engine/src/__tests__/**' | sort -u)
BLOCKING=""; TOLERATED=""
NEEDFLIP=$(grep -B1 "^(fail).*BUG:" "$LOG" | grep -A1 "test.ts:$" >/dev/null; awk '/^packages\/.*\.test\.ts:$/{f=$0; sub(/:$/,"",f)} /^\(fail\).*> BUG:.*\^ this test is marked as failing but it passed|^\(fail\).*> BUG:/{print f}' "$LOG" | sort -u)
for f in $FAILFILES; do
  case "$f" in *do_not_commit*) continue;; esac
  if echo "$UNTRACKED" | grep -qx "$f"; then TOLERATED="$TOLERATED $f"; else BLOCKING="$BLOCKING $f"; fi
done
[ -n "$NEEDFLIP" ] && out passing_bug_tests_need_flip "$(echo $NEEDFLIP | tr ' ' ',')"
[ -n "$TOLERATED" ] && out tolerated_untracked_failures "$(echo $TOLERATED | tr ' ' ',')"
if [ -n "$BLOCKING" ]; then out blocking_failures "$(echo $BLOCKING | tr ' ' ',')"; out committed false; rm -f "$LOG"; exit 0; fi
rm -f "$LOG"
PAR=$(bun test packages/riftbound-cards/src/parser/__tests__/ 2>&1 | tail -3 | tr '\n' ' '); out parser_tests "$PAR"
echo "$PAR" | grep -q ' 0 fail' || { out committed false; exit 0; }
if [ "${FORCE_TRACER:-0}" = "1" ] || printf "%s" "$LABEL" | grep -qE "[05]$"; then
  rm -rf "/tmp/pt-$LABEL"; bun packages/riftbound-engine/src/testing/playtest/game-tracer.ts --games 20 --max-turns 40 --out "/tmp/pt-$LABEL" --seed "$LABEL" >/dev/null 2>&1
  out tracer "$(bun packages/riftbound-engine/src/testing/playtest/coverage-check.ts "/tmp/pt-$LABEL" 2>/dev/null | grep -E '"moveFailed"|"costViolations"' | tr -d ' \n')"
else out tracer skipped; fi
git add -A ':!apps/riftbound-app/data/'
for f in $TOLERATED; do git reset -q -- "$f" 2>/dev/null; done   # leave in-progress red files unstaged
if git diff --cached --quiet; then out committed false; out reason nothing_staged; else
  git commit -q -m "$MSG" && out committed true && out sha "$(git rev-parse --short HEAD)"
  GIT_TERMINAL_PROMPT=0 git push origin HEAD 2>&1 | tail -1 | sed 's/^/push=/'
fi
rsync -a --delete packages/ emaynard-tcg:/root/tcg/tcg-engines/packages/ --exclude node_modules >/dev/null 2>&1 && rsync -a apps/riftbound-app/ emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/ --exclude data --exclude node_modules --exclude downloads >/dev/null 2>&1 && out synced true
out app "$(ssh -o ConnectTimeout=10 emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play' 2>/dev/null)"
bun "$REPO/.claude/fix-queue/fix-queue.ts" metrics 2>/dev/null | sed 's/^/metrics=/' || true
