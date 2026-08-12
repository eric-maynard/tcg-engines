#!/usr/bin/env bash
# Fair-queue wrapper around land-patch.sh.
#
# Two problems this solves, both observed repeatedly:
#   1. `flock` is NOT FIFO. With ~20 lanes each holding the lock for a full
#      engine suite, an ordinary lane can starve indefinitely — two lands hit
#      the full 30-minute timeout without ever acquiring while HEAD moved six
#      times. Here every lander takes a ticket and waits its turn.
#   2. An agent session's children are reaped after ~10 minutes, so a land that
#      parks inside flock dies before the suite starts and looks like a no-op.
#      Waiting OUTSIDE land-patch keeps the expensive part inside the window.
#
# Fairness is advisory: this wrapper is the queue, the gate is untouched, and
# any failure here degrades to "just run land-patch" rather than blocking lands.
#
#   bash .claude/fix-queue/land-when-free.sh <label> "<message>" <files...>
#
# fast-* and coordinator* labels keep their existing right to jump the queue.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
Q="$REPO/.claude/fix-queue/.land.tickets"
QL="$REPO/.claude/fix-queue/.land.tickets.lock"
LOCK="$REPO/.claude/fix-queue/.land.lock"
LABEL="${1:-}"
TTL=${LAND_TICKET_TTL:-1800}
DEADLINE=$(( $(date +%s) + ${LAND_FREE_WAIT:-5400} ))

touch "$Q" 2>/dev/null

# Drop stale tickets: older than TTL (namespace-independent, the only sound test
# across containers) or whose PID is provably dead in THIS namespace.
prune() {
  local now; now=$(date +%s)
  ( flock 8
    awk -F'\t' -v now="$now" -v ttl="$TTL" '($2 ~ /^[0-9]+$/) && (now - $2 < ttl)' "$Q" > "$Q.tmp" 2>/dev/null
    : > "$Q"
    while IFS=$'\t' read -r p t l; do
      [ -z "${p:-}" ] && continue
      if [ "$p" = "$$" ] || kill -0 "$p" 2>/dev/null; then printf '%s\t%s\t%s\n' "$p" "$t" "$l" >> "$Q"; fi
    done < "$Q.tmp"
    rm -f "$Q.tmp"
  ) 8>"$QL"
}

release() { ( flock 8; grep -v "^$$	" "$Q" > "$Q.tmp" 2>/dev/null; mv -f "$Q.tmp" "$Q" 2>/dev/null ) 8>"$QL" 2>/dev/null; }
trap release EXIT

case "$LABEL" in
  fast-*|coordinator*) ;;                                  # privileged: skip the queue entirely
  *) ( flock 8; printf '%s\t%s\t%s\n' "$$" "$(date +%s)" "$LABEL" >> "$Q" ) 8>"$QL" ;;
esac

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  prune
  case "$LABEL" in
    fast-*|coordinator*) head="$$" ;;
    *) head=$(awk -F'\t' 'NR==1{print $1}' "$Q" 2>/dev/null) ;;
  esac
  # Our turn = we are at the head of the queue. Do NOT also demand an idle lock:
  # under constant contention an instantaneous `flock -n` probe essentially never
  # wins, which made an earlier version of this wrapper wait out its whole
  # budget while the fleet landed around it. Hand off and let land-patch block on
  # the lock properly — being at the head is the fairness guarantee.
  if [ "${head:-$$}" = "$$" ]; then
    exec bash "$REPO/.claude/fix-queue/land-patch.sh" "$@"
  fi
  sleep 10
done

echo "committed=false"
echo "reason=land_queue_wait_exceeded_${LAND_FREE_WAIT:-5400}s (position=$(grep -n "^$$	" "$Q" 2>/dev/null | cut -d: -f1), depth=$(wc -l < "$Q" 2>/dev/null))"
