#!/usr/bin/env bash
# Find shared-tree working copies that silently SHADOW HEAD.
#
# Why this exists: a land from a side dir (LAND_SRC_DIR) commits the patch but
# leaves the SHARED tree's copy of every landed file sitting at its pre-land
# content. land-patch.sh's post-land refresh only restores a file whose shared
# copy adds nothing new vs the new HEAD, so a pre-land copy that *replaced* a
# line (rather than only deleting some) is left behind. From then on every lane
# that runs tests in the shared tree sees the landed guarantee "regressed" and
# reports HEAD as red — while HEAD is green. That cost the fleet a full
# stop-the-line cycle once (the 5784841 game-end/concede guarantees).
#
# The detection rule is exact, not heuristic: a working copy whose bytes equal
# *some earlier commit's* blob for that same path contains zero local work, so
# it can only be a stale shadow. A lane's genuine WIP never hashes to a blob
# that is already in that path's history.
#
# Usage:
#   .claude/fix-queue/stale-shadow-check.sh            # report only
#   .claude/fix-queue/stale-shadow-check.sh --fix      # restore them from HEAD
set -uo pipefail
REPO=$(git rev-parse --show-toplevel)
cd "$REPO"
FIX=0; [ "${1:-}" = "--fix" ] && FIX=1
found=0
while read -r f; do
  [ -n "$f" ] || continue
  cur=$(git hash-object "$f" 2>/dev/null) || continue
  hit=$(git log --format=%H -40 -- "$f" | while read -r s; do
    [ "$(git rev-parse "$s:$f" 2>/dev/null)" = "$cur" ] && { echo "$s"; break; }
  done | head -1)
  [ -n "$hit" ] || continue
  found=1
  echo "STALE-SHADOW $f  == blob at ${hit:0:8}  ($(git log -1 --format=%s "$hit" | cut -c1-60))"
  if [ "$FIX" = 1 ]; then
    git checkout HEAD -- "$f" && echo "  restored from HEAD"
  fi
done < <(git status --porcelain -- packages/ apps/ | sed -n 's/^ M //p')
[ "$found" = 0 ] && echo "no stale shadows — every modified working copy carries real local work"
exit 0
