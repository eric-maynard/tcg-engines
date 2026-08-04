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

