#!/usr/bin/env bash
# Patch-gated land: verify ONLY the caller's files against a clean checkout of HEAD, then commit just those files.
# Other lanes' dirty/red files in the main tree never block (or ride along with) this commit.
# Usage: land-patch.sh <label> "<commit message>" <file> [<file> ...]      (paths relative to repo root)
set -uo pipefail
REPO=/root/src/tcg/tcg-engines; cd "$REPO"
LABEL="$(printf '%s' "${1:-pX}" | tr -cd 'A-Za-z0-9_-' | cut -c1-24)"; MSG="${2:-fix(queue $LABEL)}"; shift 2 || true
out() { printf '%s=%s\n' "$1" "$2"; }
FILES=(); for f in "$@"; do f="${f#$REPO/}"; case "$f" in *do_not_commit*|apps/riftbound-app/data/*|"") ;; *) [ -e "$f" ] || git ls-files --error-unmatch "$f" >/dev/null 2>&1 && FILES+=("$f");; esac; done
[ ${#FILES[@]} -gt 0 ] || { out committed false; out reason no_files; exit 0; }
out files "${#FILES[@]}"
exec 9>"$REPO/.claude/fix-queue/.land.lock"
flock -w 1800 9 || { out committed false; out reason lock_timeout; exit 0; }
HEAD_SHA=$(git rev-parse HEAD); WT="/tmp/rb-land-wt"
# fresh side worktree at HEAD (reused dir; always reset)
if [ -d "$WT/.git" ] || [ -f "$WT/.git" ]; then git -C "$WT" reset -q --hard "$HEAD_SHA" && git -C "$WT" clean -qfdx -e node_modules -e '**/node_modules' >/dev/null 2>&1 || { git worktree remove --force "$WT" 2>/dev/null; rm -rf "$WT"; }; fi
if [ ! -e "$WT/.git" ]; then git worktree prune; git worktree add --detach -f "$WT" "$HEAD_SHA" >/dev/null 2>&1 || { out committed false; out reason worktree_add_failed; exit 0; }; fi
# dependency dirs: external deps shared from REPO, but WORKSPACE packages (@tcg/*) must resolve to the
# worktree's own packages — otherwise package-name imports test main-tree code instead of the patch.
link_nm() { # $1 = relative node_modules path (root or per-package)
  local src="$REPO/$1" dst="$WT/$1"; [ -d "$src" ] || return 0
  if [ -L "$dst" ]; then rm -f "$dst"; fi
  mkdir -p "$dst"
  for e in "$src"/* "$src"/.bin; do [ -e "$e" ] || continue; b=$(basename "$e");
    case "$b" in @tcg) ;; *) [ -e "$dst/$b" ] || ln -s "$e" "$dst/$b";; esac; done
  if [ -d "$src/@tcg" ]; then mkdir -p "$dst/@tcg"; for e in "$src/@tcg"/*; do b=$(basename "$e"); tgt=$(readlink -f "$e"); rel="${tgt#$REPO/}"; [ -e "$dst/@tcg/$b" ] || ln -s "$WT/$rel" "$dst/@tcg/$b"; done; fi
}
link_nm node_modules
for d in packages/*/node_modules apps/*/node_modules; do [ -d "$REPO/$d" ] && link_nm "$d"; done
# apply the caller's files onto the clean tree (copy current content; handle deletions)
for f in "${FILES[@]}"; do if [ -e "$REPO/$f" ]; then mkdir -p "$WT/$(dirname "$f")" && cp "$REPO/$f" "$WT/$f"; else rm -f "$WT/$f"; fi; done
# gates in the side tree
for f in "${FILES[@]}"; do case "$f" in apps/riftbound-app/public/js/*.js|apps/riftbound-app/public/js/**/*.js) node --check "$WT/$f" >/dev/null 2>&1 || { out js_syntax "FAIL:$f"; out committed false; exit 0; };; esac; done
LOG=$(mktemp); ( cd "$WT" && bun test packages/riftbound-engine/src/__tests__/ >"$LOG" 2>&1 || true )
out engine_tests "$(tail -4 "$LOG" | tr '\n' ' ')"
BLOCK=$(awk '/^packages\/.*\.test\.ts:$/{f=$0; sub(/:$/,"",f)} /^\(fail\)/{print f}' "$LOG" | grep -v do_not_commit | sort -u | tr '\n' ',')
if [ -n "$BLOCK" ]; then out blocking_failures "$BLOCK"; grep -B1 -A0 "^(fail)" "$LOG" | grep "^(fail)" | head -12 | sed 's/^/fail=/' ; grep -c "marked as failing but it passed" "$LOG" | sed 's/^/need_flip_count=/'; out committed false; rm -f "$LOG"; exit 0; fi
rm -f "$LOG"
if printf '%s\n' "${FILES[@]}" | grep -q '^packages/riftbound-cards/'; then PAR=$( cd "$WT" && bun test packages/riftbound-cards/src/parser/__tests__/ 2>&1 | tail -3 | tr '\n' ' '); out parser_tests "$PAR"; echo "$PAR" | grep -q ' 0 fail' || { out committed false; exit 0; }; fi
# commit exactly these files in the main tree
git add -A -- "${FILES[@]}" 2>/dev/null
if git diff --cached --quiet -- "${FILES[@]}"; then out committed false; out reason nothing_staged; exit 0; fi
git commit -q -m "$MSG" -- "${FILES[@]}" && out committed true && out sha "$(git rev-parse --short HEAD)"
GIT_TERMINAL_PROMPT=0 git push origin HEAD 2>&1 | tail -1 | sed 's/^/push=/'
# sync + bounce (best effort; app tree = main tree which may include others' WIP — acceptable for the dev box)
rsync -a --delete packages/ emaynard-tcg:/root/tcg/tcg-engines/packages/ --exclude node_modules >/dev/null 2>&1 && rsync -a apps/riftbound-app/ emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/ --exclude data --exclude node_modules --exclude downloads >/dev/null 2>&1 && out synced true
out app "$(ssh -o ConnectTimeout=10 emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play' 2>/dev/null)"
bun "$REPO/.claude/fix-queue/fix-queue.ts" metrics 2>/dev/null | sed 's/^/metrics=/' || true
