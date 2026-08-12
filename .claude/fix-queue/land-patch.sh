#!/usr/bin/env bash
# Patch-gated land: verify ONLY the caller's files against a clean checkout of HEAD, then commit just those files.
# Other lanes' dirty/red files in the main tree never block (or ride along with) this commit.
# Usage: land-patch.sh <label> "<commit message>" <file> [<file> ...]      (paths relative to repo root)
set -uo pipefail
REPO=/root/src/tcg/tcg-engines; cd "$REPO"
LABEL="$(printf '%s' "${1:-pX}" | tr -cd 'A-Za-z0-9_-' | cut -c1-24)"; MSG="${2:-fix(queue $LABEL)}"; shift 2 || true
out() { printf '%s=%s\n' "$1" "$2"; }
FILES=(); for f in "$@"; do f="${f#$REPO/}"; case "$f" in *do_not_commit*|apps/riftbound-app/data/*|"") ;; *) [ -e "$f" ] || git ls-files --error-unmatch "$f" >/dev/null 2>&1 && FILES+=("$f");; esac; done
# file-level embargo: .claude/fix-queue/embargo-files.txt lines "owner<TAB>regex" — patches touching matching files are refused unless LABEL starts with owner
EF="$REPO/.claude/fix-queue/embargo-files.txt"; if [ -s "$EF" ]; then while IFS=$'\t' read -r owner rx; do [ -z "$rx" ] && continue; case "$LABEL" in "$owner"*) continue;; esac; hit=$(printf '%s\n' "${FILES[@]}" | grep -E "$rx" | head -1); if [ -n "$hit" ]; then out embargoed_file "$hit (owned by $owner package) — DROP this file from your land list and re-run; NEVER git checkout/restore/stash it in the shared tree (that destroys the package owner's uncommitted work)"; out committed false; exit 0; fi; done < "$EF"; fi
[ ${#FILES[@]} -gt 0 ] || { out committed false; out reason no_files; exit 0; }
out files "${#FILES[@]}"
# priority lane: if .land.priority names label prefixes (one per line), other callers yield up to 20 min before contending for the lock
PRIO="$REPO/.claude/fix-queue/.land.priority"; FASTQ="$REPO/.claude/fix-queue/.land.fast-waiting"
case "$LABEL" in fast-*|coordinator*) touch "$FASTQ.$$";; esac  # announce a fast/coordinator land is waiting → others yield
for _ in $(seq 1 60); do mine=1; case "$LABEL" in fast-*|coordinator*) mine=0;; esac; othersfast=$(ls "$FASTQ".* 2>/dev/null | grep -v "\.$$\$" | head -1); if [ $mine = 1 ] && [ -n "$othersfast" ]; then sleep 15; continue; fi; [ -s "$PRIO" ] || break; grep -q . "$PRIO" || break; y=1; while read -r pfx; do [ -n "$pfx" ] && case "$LABEL" in "$pfx"*) y=0;; esac; done < "$PRIO"; [ $y = 0 ] && break; sleep 20; done
trap 'rm -f "$FASTQ.$$" 2>/dev/null' EXIT
# tmp hygiene (cheap, once per land): prune day-old playtest traces and 12h-stale worker scratch dirs so /tmp (tmpfs) never fills
( find /tmp/playtest-traces -mindepth 1 -maxdepth 1 -mmin +1440 -exec rm -rf {} + ; for d in /tmp/w[0-9]i[0-9]* /tmp/w[0-9][0-9]i[0-9]* /tmp/rb-land-baseline-*; do [ -e "$d" ] && [ -n "$(find "$d" -maxdepth 0 -mmin +720)" ] && rm -rf "$d"; done ) >/dev/null 2>&1 || true
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
# LAND_SRC_DIR: take a file from that directory (same relative path) instead of the shared tree — lets a lane land HEAD+its-own-hunk when another live lane has hunks in the same shared file
for f in "${FILES[@]}"; do src="$REPO/$f"; if [ -n "${LAND_SRC_DIR:-}" ] && [ -e "$LAND_SRC_DIR/$f" ]; then src="$LAND_SRC_DIR/$f"; out src_override "$f"; fi; if [ -e "$src" ]; then mkdir -p "$WT/$(dirname "$f")" && cp "$src" "$WT/$f"; else rm -f "$WT/$f"; fi; done

# Stale-base guard. Lands copy WHOLE files, so a lane whose base predates a
# landed commit silently reverts it — and nothing catches that when the loss is
# in a doc or an uncovered path (it cost us the sole-option feature once).
# Refuse when an incoming file has dropped the bulk of some recently-landed
# commit; the lane must rebase onto HEAD. LAND_ALLOW_STALE=1 overrides for a
# deliberate revert.
if [ "${LAND_ALLOW_STALE:-0}" != 1 ] && [ -x "$REPO/.claude/fix-queue/stale-base-check.py" ]; then
  STALE=$( cd "$WT" && REPO="$WT" python3 "$REPO/.claude/fix-queue/stale-base-check.py" "${FILES[@]}" 2>/dev/null )
  if [ -n "$STALE" ]; then
    printf '%s\n' "$STALE"
    out stale_base "REFUSED — rebase your copies onto HEAD (git show HEAD:<path>) and re-land; LAND_ALLOW_STALE=1 only for a deliberate revert"
    out committed false
    exit 0
  fi
fi
# gates in the side tree
for f in "${FILES[@]}"; do case "$f" in apps/riftbound-app/public/js/*.js|apps/riftbound-app/public/js/**/*.js) [ -e "$WT/$f" ] || continue; node --check "$WT/$f" >/dev/null 2>&1 || { out js_syntax "FAIL:$f"; out committed false; exit 0; };; esac; done
# FAST LANE (user-feedback UI fixes): LAND_FAST=1 or label "fast-*" AND the patch touches no packages/ file → skip the engine suite (app tests below still run for app files)
FAST=0; case "$LABEL" in fast-*) FAST=1;; esac; [ "${LAND_FAST:-0}" = 1 ] && FAST=1
if [ "$FAST" = 1 ] && ! printf '%s\n' "${FILES[@]}" | grep -q '^packages/'; then out engine_tests "SKIPPED (fast lane: app-only patch)"; else
# sharded engine suite: N parallel bun processes over a round-robin split of the test files (same log format, merged)
LOG=$(mktemp); SHARDS=${LAND_SHARDS:-6}; SD=$(mktemp -d)
( cd "$WT" && find packages/riftbound-engine/src/__tests__ -name '*.test.ts' | sort | awk -v n="$SHARDS" -v d="$SD" '{print "./" $0 > (d "/shard" (NR%n))}' )
for sf in "$SD"/shard*; do ( cd "$WT" && timeout 900 bun test $(cat "$sf") >"$sf.log" 2>&1 || true ) & done; wait
cat "$SD"/shard*.log > "$LOG"
TOT=$(grep -ho "Ran [0-9]* tests" "$SD"/shard*.log | awk '{s+=$2} END {print s+0}'); FL=$(grep -hoE "^ *[0-9]+ fail$" "$SD"/shard*.log | awk '{s+=$1} END {print s+0}'); NS=$(ls "$SD"/shard*.log | wc -l); OKS=$(grep -lc "Ran [0-9]* tests" "$SD"/shard*.log | wc -l)
out engine_tests "Ran $TOT tests in $NS shards ($OKS completed) · $FL fail"
[ "$OKS" -lt "$NS" ] && { out blocking_failures "shard_crashed_or_timed_out"; grep -L "Ran [0-9]* tests" "$SD"/shard*.log | head -2 | while read -r x; do tail -5 "$x" | sed 's/^/fail=/'; done; out committed false; rm -rf "$SD" "$LOG"; exit 0; }
rm -rf "$SD"
BLOCK=$(awk '/^packages\/.*\.test\.ts:$/{f=$0; sub(/:$/,"",f)} /^\(fail\)/{print f}' "$LOG" | grep -v do_not_commit | sort -u | tr '\n' ',')
if [ -n "$BLOCK" ]; then out blocking_failures "$BLOCK"; grep -B1 -A0 "^(fail)" "$LOG" | grep "^(fail)" | head -12 | sed 's/^/fail=/' ; grep -c "marked as failing but it passed" "$LOG" | sed 's/^/need_flip_count=/'; out committed false; rm -f "$LOG"; exit 0; fi
rm -f "$LOG"
fi  # end fast-lane else
if printf '%s\n' "${FILES[@]}" | grep -q '^packages/riftbound-cards/'; then PAR=$( cd "$WT" && bun test packages/riftbound-cards/src/parser/__tests__/ 2>&1 | tail -3 | tr '\n' ' '); out parser_tests "$PAR"; echo "$PAR" | grep -q ' 0 fail' || { out committed false; exit 0; }; fi
if printf '%s\n' "${FILES[@]}" | grep -qE '^apps/riftbound-app/(server|src)/|^packages/riftbound-mcp/'; then APPT=$( cd "$WT" && timeout 300 bun test apps/riftbound-app/server/__tests__/ 2>&1 | tail -3 | tr '\n' ' '); out app_tests "$APPT"; echo "$APPT" | grep -q ' 0 fail' || { out committed false; exit 0; }; fi
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
if git -C "$WT" diff --name-only "$HEAD_SHA" "$NEW" | grep -qE "(^|/)package\.json$|bun\.lockb?$"; then ssh -o ConnectTimeout=8 emaynard-tcg "cd /root/tcg/tcg-engines && ~/.bun/bin/bun install >/dev/null 2>&1" && out devbox_bun_install ok || out devbox_bun_install failed; fi
# Bounce policy: restarting the app drops in-memory sandbox games and breaks multi-turn browser tests, so
# (a) never bounce while a browser pass holds /tmp/rb-browser-pass.lock (younger than 4h), and
# (b) otherwise bounce at most once per 15 minutes. Files are already synced; the app picks them up on next bounce.
BL=/tmp/rb-browser-pass.lock; LB=/tmp/rb-last-bounce
if [ -e "$BL" ] && [ $(( $(date +%s) - $(stat -c %Y "$BL") )) -lt 14400 ]; then out app "deferred(browser-pass-active)";
elif [ -e "$LB" ] && [ $(( $(date +%s) - $(stat -c %Y "$LB") )) -lt 900 ]; then out app "deferred(rate-limit)";
else touch "$LB"; out app "$(ssh -o ConnectTimeout=10 emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/play' 2>/dev/null)"; fi
bun "$REPO/.claude/fix-queue/fix-queue.ts" metrics 2>/dev/null | sed 's/^/metrics=/' || true
