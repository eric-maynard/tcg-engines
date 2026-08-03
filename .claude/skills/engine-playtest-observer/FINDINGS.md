# Playtest-Observer Findings

## Engine bugs fixed on branch `rules-digest-and-lookup`

| # | Rule | Bug | Fix commit |
|---|---|---|---|
| 1 | — | `resolveAmount()` crashes on `amount:"all"` | c06a661 |
| 2 | — | `reveal-hand` deadlocks when filter excludes every revealed card | c06a661 |
| 3 | 627.4 | `resolveFullCombat` early-returns leave `contested=true` → infinite `startShowdown` loop | c06a661 |
| 4 | 140.1.b/c, 508, 553, 589.1.a | 8 discretionary moves not gated on Neutral Open | 058f876 |
| 5 | 631 | `resolveFullCombat` awards VP without recording `scoredThisTurn` → double-scoring | 1ba4fcd |
| 7 | 597/723.1.c | `hideCard` had no enumerator; `hasKeyword` didn't read `abilities[{type:"keyword"}]` | bf949ac |
| 8 | 601 | `counterSpell` was a free enumerated player move; Counter is a card effect | 4d33647 |
| 9 | 550.1 | Combat showdown `defendingPlayer` set to attacker; `relevantPlayers` omitted defender | c05e29a |
| 10 | 548 | `startShowdown` allowed nested showdowns | 058f876 |
| 11 | 537.1/541.2 | Triggered abilities stole chain `activePlayer` from creator | c785c65 |
| 12 | 553.4.a | Showdown `passedPlayers` not reset when a player acts instead of passing | c05e29a |
| 13 | 509.1 | `passShowdownFocus` allowed while chain active | 058f876 |
| 14 | 160/517.2.c | `emptyRunePool` only emptied active player's pool (also in production `server.ts`) | 058f876 |
| — | auth | server.ts passed client `moveId` straight to `executeMove` with no denylist → free channelRunes/drawCard/emptyRunePool on opponent | 3d5aee9 |

Verified after each: 1214 pass / 0 fail full engine suite; 30–100 tracer games finish clean; 0 moveFailed.

## Remaining (not yet fixed)

| # | Rule | Bug | File hint |
|---|---|---|---|
| 6 | 625.1 | `resolveFullCombat` was offered before mandatory Showdown Step (partially addressed by neutral-open guard on resolveFullCombat) | combat.ts |
| — | 626.1.d | Combat damage atomic — no attacker-first / defender-second distribution choice when >1 target unit | combat/ |

## Harness

- `game-tracer.ts` + `game-setup.ts` (`createPlayableGame` / `advanceTurn`) — headless bot-vs-bot games with real cards
- `coverage-check.ts` — auto-triages high-cost/reaction variance vs suspicious never-playable cards
- `.claude/workflows/riftbound-rule-observers.js` — 6 sections × N traces observers → dedupe → verify
- Rule lookup: `bun .claude/skills/riftbound-rules/scripts/rule.ts <id>` (backed by `rules-db.json`, 1364 rules)
