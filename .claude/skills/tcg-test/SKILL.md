---
name: tcg-test
description: Run one full Riftbound test pass — headless tracer invariants + monkey gameplay-flow + per-card playtest on the next N untested cards. Returns a merged report and updates tested-card tracking.
---

# tcg-test

One entry point for the three test harnesses. Each pass runs:

1. **Headless tracer** (~45s): 100 random games on the devbox → `moveFailed`, `enumErrors`, `costViolations`, coverage.
2. **Monkey** (~10 min/round): random real-UI clicks + 8 hard invariants (`cost-paid`, `pendingChoice-gates-moves`, `unit-enters-exhausted`, etc.) + expert per-step.
3. **Per-card playtest** (~15-20 min for 48 cards): each agent tutors a card into hand, plays it via the live UI, does what the rulesText says, reports what didn't match. Tracks progress in `tested-cards.json`.

## Prerequisites (verify once per session)

- Devbox `emaynard-tcg` reachable; app supervisor running (`ssh emaynard-tcg 'cat /tmp/app.pid'`)
- Port forward: `ssh -N -L 3000:localhost:3000 emaynard-tcg &` → `curl -sI http://localhost:3000/play` returns 200
- 24 pw-repl lanes: `ls /tmp/pw-repl-*.sock | wc -l` should be ≥24; if not, in a tmux window: `cd /tmp/pwtest && for i in $(seq 0 23); do (bun pw-repl.ts --sock $i start > /tmp/pw-repl-$i.log 2>&1 &); done`

## Run

Invoke the wrapper workflow:

```
Workflow({
  scriptPath: '.claude/workflows/riftbound-test.js',
  args: { cards: 48, lanes: 12, monkeyRounds: 1, seed: '<unique>' }
})
```

Args (all optional):
- `cards` — how many untested cards to playtest this pass (default 48)
- `lanes` — parallel browser sessions (default 12; must ≤ running pw-repl count)
- `monkeyRounds` — how many monkey rounds (default 1; 0 to skip)
- `seed` — deterministic seed for tracer + monkey + card-pick shuffle
- `cardIds` — override auto-pick with a specific list (e.g. re-test after fixes)
- `rulings` — how many FAQ rulings to execute as live scenarios (default 0; 96 total available). Curated hard cases from riftboundfaq.com — interactions random play won't hit.
- `autoFix` — apply top-N systemic fixes + sync + bounce before returning (default true). Set false to report-only.
- `fixTopN` — how many systemic (engine/server layer) bugs to auto-fix per pass (default 4).

## Output

`{headless, monkey, cards, byLayer, totalConfirmed}` — save to `.claude/skills/engine-playtest-observer/TEST-PASS-<seed>.json`.

`tested-cards.json` is updated automatically. To reset: `echo '{"tested":[]}' > .claude/skills/tcg-test/tested-cards.json`.

## After a pass

For each systemic bug (affects a class of cards), spawn a fix agent → sync to devbox → `bun test packages/riftbound-engine/src/__tests__/` → bounce app (`ssh emaynard-tcg 'kill $(cat /tmp/app.pid)'`). Card-specific bugs can be batched.

## Runtime & cost per pass (defaults: 48 cards, 1 monkey round)

| Phase | Time | Tokens |
|---|---|---|
| Headless | ~45s | ~5K |
| Monkey (1 round) | ~10 min | ~1.5M |
| Card-playtest (48) | ~15-20 min | ~2.2M |
| **Total** | **~25-30 min** | **~3.7M** |

Full 786-card coverage at 48/pass ≈ 16 passes ≈ 8 hours wall-clock, ~60M tokens.

## Fix queue (decoupled fixing)

Discovery no longer fixes inline. All sources append to `.claude/fix-queue/` (one JSON per item; `open/ → claimed/ → done/|failed/`):

| Source | How it enqueues |
|---|---|
| `/tcg-test` pass (monkey, rulings, card playtest) | `Enqueue` phase → `fix-queue.ts enqueue-findings` (autoFix now defaults **off**; pass `autoFix:true` to restore inline fixing) |
| Expert unit-test writer (`riftbound-card-unit-tests.js`) | every `test.failing("BUG: …")` → `fix-queue.ts enqueue-bugs` (repro = file + test name) |
| Interaction-test writer (`riftbound-interaction-tests.js`) | same |
| Humans | `bun .claude/fix-queue/fix-queue.ts enqueue-findings <json>` or write a `test.failing("BUG…")` test |

The **standing fixer** (`.claude/workflows/riftbound-fixer.js`, args `{batch,lanes,rounds}`) loops: reap stale claims → rescan BUG tests → triage open items into root-cause clusters (same-file ⇒ same cluster) → one lane per cluster claims its ids atomically, fixes against the repro tests, flips `test.failing`→`test`, marks `done`/`fail` → Land step gates (engine+parser tests 0 fail, tracer) → commit → push → rsync+bounce → next round. `bun .claude/fix-queue/fix-queue.ts stats|list open` to inspect.
