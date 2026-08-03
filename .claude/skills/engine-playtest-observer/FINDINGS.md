# Playtest-Observer Findings — 2026-08-03

Traces: `/tmp/pt-stress/game-stress-[0-4].jsonl` (5 games, 964 steps).
Observers: 3 agents (§5+§9, §6+§7, §8+§11) using DIGEST + `rule.ts`.

## Engine bugs (fixed this session — commits 7e694be..HEAD)

| # | Rule | Bug | Fix |
|---|---|---|---|
| 1 | — | `resolveAmount()` crashes on `amount:"all"` | effect-executor.ts: handle string/null |
| 2 | — | `reveal-hand` deadlocks when filter excludes every revealed card | effect-executor.ts: check valid picks first |
| 3 | 627.4 | `resolveFullCombat` early-returns leave `contested=true` → infinite `startShowdown` loop | combat.ts: clear contested on all early returns |
| 4 | 140.1.b/c, 508, 553, 589.1.a | `standardMove`/`playUnit`/`playGear`/`contestBattlefield`/`resolveFullCombat`/`scorePoint`/`conquerBattlefield`/`startShowdown` allowed during chain/showdown | added `getTurnState()==="neutral-open"` guards to condition + enumerator across movement/cards/combat/chain-moves |
| 10 | 548 | `startShowdown` allows nested showdowns | added `!getActiveShowdown()` guard |
| 13 | 509.1 | `passShowdownFocus` allowed while chain active | added `!chain.active` guard |
| 14 | 160/517.2.c | `emptyRunePool` only emptied active player's pool (production app has same bug) | removed activePlayer check from condition |

Verified: 1214 pass / 0 fail; 50/50 tracer games finish; 0 moveFailed.

## Engine bugs (identified, not yet fixed)

| # | Rule | Bug | File hint |
|---|---|---|---|
| 5 | 631 | `scorePoint` allows same battlefield to score twice via Conquer in one turn | combat.ts scorePoint enumerator/condition |
| 6 | 625.1 | `resolveFullCombat` offered before mandatory Showdown Step | combat.ts — should require showdown to have completed |
| 7 | 723.1.c | `hideCard` has no enumerator — Hidden keyword never usable via enumeration | cards.ts:798 |
| 8 | 558/540.1.b | `counterSpell` applied instantly instead of going on chain | chain-moves.ts counterSpell |
| 9 | 550.1 | Combat showdown `defendingPlayer` set to attacker; `relevantPlayers` omits defender | combat/ defender derivation |
| 11 | 537.1/541.2 | Chain `activePlayer` set to trigger's controller instead of chain creator | chain/ activePlayer assignment |
| 12 | 553.4.a | Showdown `passedPlayers` not reset on non-pass action | chain/showdown passedPlayers |

## Harness issues (not engine)

- `battlefields.*.units` always 0 in traces — `compact()` reads `bf.units` which doesn't exist; units live in `battlefield-<id>` zone.
- Rune-pool empty finding (517.2.c) — verify `emptyRunePool` move works for non-active player, or `advanceTurn()` ordering.
- Post-`endTurn` snapshot taken before `advanceTurn()` runs — trace ordering.

## Coverage

- 100/100 games finish (random-deck strategy)
- 454/769 defs in decks; 412 in hand; 314 playable; 98 drawn-but-never-playable (96 are cost≥5 = variance; 3 cheap-and-suspicious: sfd-135-221 Factory Recall, unl-166-219 Stalking Wolf, unl-182-219 Curtain Call)
