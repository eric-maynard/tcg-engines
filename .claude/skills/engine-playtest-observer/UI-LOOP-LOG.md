# UI Loop Log

| Round | Screenshots | Total findings | HIGH | Fixed | Notes |
|---|---|---|---|---|---|
| 1 | 8 | 106 | 16 | — | baseline (before any fixes) |
| 2 | 8 | 98 | 11 | 5 | vs+d20, mulligan-left, deck-coherence, bf-size, email-leak, top-hover |
| 3 | 14 | 166 | — | — | baseline for extended driver (14 shots) |
| L1 | 14 | 116 | 17 | 5/6 | auto-loop wf_027b02e7 |
| L2 | 14 | 114 | 14 | 5/6 | |
| L3 | 14 | 114 | 13 | 6/6 | |
| L4 | 14 | 115 | 11 | 5/6 | |
| L5 | 14 | 110 | 7 | 4/6 | onboarding→banner, mulligan-width, sidebar-scroll, tooltip-anchor |
| — | — | — | — | 25 total | tmux killed by pkill -f in sync agent; restarted |

## Rules-correctness loop (wf_794fa2b2-7b3, 381 agents, 34.4M tok, 71 min)

Driver: `ui-rules-drive.ts` — plays a real game via `executeMove()`, captures `{state,moves,zones,ui}` per step. 5 checks × 17 steps × judge → verify → fix.

| Round | Raw | Unique | CONFIRMED | Fixed | Rules |
|---|---|---|---|---|---|
| pre | — | — | 2 | 2 | return-to-hand fizzle; server channelRunes directed:true |
| 1 | 25 | 15 | 9 | 5 | 357.1.a, 164.2.b, 355.8/9.a/10.e, 309.1.a, 358.3.a, 419.1.a, 429.3 |
| 2 | 13 | 8 | 3 | 2 | 357.1.a (champion), 144.3 (group move), 108.3.d |
| 3 | 23 | 11 | 10 | 3 | 419.1.a/2.a, 827.1.c.1, 310.1.a, 355.5.a/10.a.1/10.d, 145.2 |
| 4 | 6 | 5 | **0** | — | converged |

**24 rules/card bugs found + fixed via live UI.** All 1265/0 tests green.

## Headless observer R5 (wf_e752afc8-695, 8 traces, 159 agents, 18.7M tok)

**60 CONFIRMED** (190 raw → 75 unique). Top cluster = **mandatory-combat-sequencing gap**:

| Rule | Count | Gap |
|---|---|---|
| 460 | 11 | Combat initiation modeled as elective, not mandatory at Cleanup |
| 465.1/.2/.2.c | 16 | Combat Damage Step optional after showdown closes; no attacker-first distribution |
| 348.1 | 7 | Showdown-close doesn't force remaining combat steps; can re-open |
| 466.5.d | 6 | Establish Control / Conquer optional, deferrable across turns |
| 308.1/.1.a, 343.1.a | 13 | Turn state not Showdown while Combat is in progress |
| 320.1 | 3 | Priority/Focus awarded during Cleanup |
| 383.3 | 5 | Triggers not always on chain (known) |
| 811.1.b, 823.1.c.1, 808.1.c | 10 | Hidden→Reaction, Hunt, Deathknell keyword impls |
| 439.2 | 3 | Create-token zone entry |

**Fix path**: introduce an `outstandingTasks` queue on interaction state; when a task is queued, only that task's move enumerates. `combatPending[]` in state-based-checks.ts:334 already computes what's needed — it's just never consumed. See `HEADLESS-R5-RESULTS.json`.

