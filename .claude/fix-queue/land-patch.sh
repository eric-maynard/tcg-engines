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
HEAD_SHA=$(git rev-parse HEAD); WT="/tmp/rb-land-wt-LOCKED-do-not-touch"
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
# commit exactly the TESTED bytes: commit inside the side worktree (detached at HEAD_SHA + copied files),
# then fast-forward the main branch ref to it and resync the main index for those paths.
BR=$(git -C "$REPO" symbolic-ref --short HEAD 2>/dev/null || echo "")
[ -n "$BR" ] || { out committed false; out reason main_detached; exit 0; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$HEAD_SHA" ] || { out committed false; out reason head_moved_retry; exit 0; }
git -C "$WT" add -A -- "${FILES[@]}" 2>/dev/null
if git -C "$WT" diff --cached --quiet; then out committed false; out reason nothing_staged; exit 0; fi
git -C "$WT" commit -q -m "$MSG" || { out committed false; out reason wt_commit_failed; exit 0; }
NEW=$(git -C "$WT" rev-parse HEAD)
# Post-commit integrity: every file that differs between REPO copy and HEAD_SHA must be in the commit; else roll back.
MISSING=""; for f in "${FILES[@]}"; do
  if ! git -C "$WT" diff --quiet "$HEAD_SHA" "$NEW" -- "$f" 2>/dev/null; then continue; fi   # in commit (differs) → ok
  # not in commit: acceptable only if the file is identical to HEAD_SHA's version (nothing to commit)
  if [ -e "$REPO/$f" ] && git -C "$WT" cat-file -e "$HEAD_SHA:$f" 2>/dev/null; then cmp -s "$REPO/$f" <(git -C "$WT" show "$HEAD_SHA:$f") || MISSING="$MISSING $f"; elif [ -e "$REPO/$f" ]; then MISSING="$MISSING $f"; fi
done
if [ -n "$MISSING" ]; then git -C "$WT" reset -q --hard "$HEAD_SHA"; out committed false; out reason commit_incomplete; out missing "$(echo $MISSING | tr ' ' ',')"; exit 0; fi
git -C "$REPO" update-ref "refs/heads/$BR" "$NEW" "$HEAD_SHA" || { out committed false; out reason ref_update_failed; exit 0; }
git -C "$REPO" reset -q -- "${FILES[@]}" >/dev/null 2>&1   # index ← new HEAD for these paths; working tree untouched
out committed true; out sha "$(git -C "$REPO" rev-parse --short HEAD)"
GIT_TERMINAL_PROMPT=0 git -C "$REPO" push origin "$BR" 2>&1 | tail -1 | sed 's/^/push=/'
# sync + bounce from the VERIFIED worktree at the new HEAD (never the dirty main tree → no mixed snapshots on the devbox)
NEW_SHA=$(git rev-parse HEAD); git -C "$WT" reset -q --hard "$NEW_SHA" >/dev/null 2>&1
rsync -a --delete "$WT/packages/" emaynard-tcg:/root/tcg/tcg-engines/packages/ --exclude node_modules >/dev/null 2>&1 && rsync -a "$WT/apps/riftbound-app/" emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/ --exclude data --exclude node_modules --exclude downloads >/dev/null 2>&1 && out synced "$NEW_SHA"
# Bounce policy: restarting the app drops in-memory sandbox games and breaks multi-turn browser tests, so
# (a) never bounce while a browser pass holds /tmp/rb-browser-pass.lock (younger than 4h), and
# (b) otherwise bounce at most once per 15 minutes. Files are already synced; the app picks them up on next bounce.
BL=/tmp/rb-browser-pass.lock; LB=/tmp/rb-last-bounce
if [ -e "$BL" ] && [ $(( $(date +%s) - $(stat -c %Y "$BL") )) -lt 14400 ]; then out app "deferred(browser-pass-active)";
elif [ -e "$LB" ] && [ $(( $(date +%s) - $(stat -c %Y "$LB") )) -lt 900 ]; then out app "deferred(rate-limit)";
else touch "$LB"; out app "$(ssh -o ConnectTimeout=10 emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play' 2>/dev/null)"; fi
bun "$REPO/.claude/fix-queue/fix-queue.ts" metrics 2>/dev/null | sed 's/^/metrics=/' || true
