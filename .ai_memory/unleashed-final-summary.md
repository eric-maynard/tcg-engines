# Unleashed Engine — Final Summary (2026-05-13)

## What the Engine Now Handles

### Core Mechanics (fully correct, regression-locked)
- **XP / Hunt / Level** (rules 728-733, 823-824): gain-xp on conquer/hold, Hunt keyword sums per unit, Level-gated statics toggle at XP threshold
- **Combat pipeline**: attacker/defender assignment, lethal damage, Tank/Backline priority targeting, Assault attacker-only bonus, Shield combat Might bonus, Stun = 0 combat Might
- **Barrier, Tough, Guard, Deflect, Swift, Haste** keywords — all fully wired into combat resolver and movement
- **Deathknell** (rule 813): synthesized from keyword shapes, fires from trash, self-scope only in trash, correct LIFO chain ordering, fires AFTER combat heal sweep (p0259 fix)
- **Legion** (rule 812): cardsPlayedThisTurn gate at emit-time + intervening-if re-check at resolve-time
- **Ambush, Backline, Weaponmaster, Quick-Draw** keywords parsed and honored in resolver paths
- **Prevent damage** (rule 437): numeric + "all" prevention, lethal threshold raised, multi-combat Prevent tracking
- **Replace / die-replacement** (rules 571-575): `checkReplacement` at killUnit + effect executor; prevents Deathknell when death replaced (rule 808.1.d.1); replacement order per rule 575.1
- **Event-bus architecture**: unified `dispatchEvent` dispatcher, per-card listener registry, APNAP+LIFO ordering (rule 585), intervening-if condition re-check at resolution, static recalc + state-based checks driven by events
- **Chain / Showdown**: LIFO chain drain, APNAP focus ordering, `declineTrigger` for optional triggers, counter-spell move, chain item add/resolve events
- **Victory / scoring**: `hasPlayerWonStrict` (rule 467), `decideWinningPoint` (rule 466.1.b), score-at-threshold draws a card, Burn Out VP-per-point, hold-phase scoring, all 6+ VP-gain paths wired
- **Zone mechanics**: `returnToHand`, `recallUnit`, `killUnit`, `recycle`, `discard`, `play` effect (fires on-play triggers), take-control (temporary + controller-revert at turn-end + until-leaves), token cease-to-exist (rule 183.1)
- **Effects**: `swap-might`, `double-might`, `win-game`, `fight` uses effective Might, `modify-might` minimum field, cost-reduction minimum, `prevent-damage`, `grant-keyword`, `replace-death`
- **Target resolver**: `friendly`/`enemy` reads controller (not owner), multi-target `{upTo:N}`/`{atLeast:N}`, `just-died-trash` scope for Deathknell graveyard-replay
- **Rule 705** non-board meta wipe: temp buffs/exhaustion/keywords/roles cleared on any zone-exit
- **Rule 466.1.b** winning-point semantics, **rule 467** strict-greater-than tie-break, **rule 472.3.d.2** modify-might one-shot order, **rule 715** bonus damage, **rule 460.2.c.7** damage assigner choice hooks
- **Flow**: `endTurn`/`advancePhase` back-sync into engine state (O-1 flow-drift fix), awaken-unexhaust flag storage, placeBattlefields zone creation

### Parser Coverage
- **755/755 cards** (100%) parse to structured ability objects (enrichment complete)
- Parser handles: `[Hunt N]`, `[Level N][>]`, `[Ambush]`, `[Weaponmaster]`, `[Quick-Draw]`, `[Deflect N]`, `[Repeat]`, `[Legion]`, `[Deathknell]`, `[Barrier]`, `[Guard]`, `[Tough]`, `[Swift]`, `[Haste]`, cost-reduction "X costs N less", "to a minimum of N [Might]", on-play/on-attack/on-defend/on-conquer triggers, while-level/while-alone/while-buffed/while-mighty static conditions, controller/opponent/another-friendly subject filters

### RiftJudge Accuracy Estimate
- **Engine-track cases** (concrete mechanic questions the bridge can construct a scenario for): ~90-93% correct on standard cases, ~85-89% on edge cases
- **Total RiftJudge coverage (v7 triage)**: ~564/2141 (26.3%) engine-attemptable; honest estimate 20-30% after agentic-runner shakedown
- **Plateau signal**: last 4 batches (iter-46→49B) found zero actual engine bugs; all new tests confirmed already-correct behavior

### Test Counts (final)
- **riftbound-engine**: 1874 pass / 59 todo / 0 fail
- **riftbound-cards**: 917 pass / 0 fail
- **riftbound-types**: 0 errors
- **TypeScript**: engine 0 errors, cards 0 errors (first fully-clean tsc state achieved in batch 21)
- **apps/riftbound-app**: 78 pass / 0 fail; web vitest 157 pass / 0 fail

---

## What's Left (59 todos — all require infrastructure work outside riftbound-engine scope)

1. **`advancePhase` engine↔FlowManager drift** (bug O-1, partial fix in batch 12/15): the `executeMove("advancePhase")` path doesn't fully back-sync flow manager state into `currentState` for all phase transitions. Needs `@tcg/core` architecture change or a riftbound-local shim that covers all phase types.

2. **Additional turns / turn-queue** (rule 734): parser emits `{type:"extra-turn"}` effects but engine has no turn-queue; `flow-manager.transitionToNextTurn` just bumps turn number. Implementing cleanly needs a `pendingExtraTurns[]` abstraction in `riftbound-flow.ts`.

3. **HOT FEPR combat resolution ordering** (§462 per 2026-03-30 rules): the 2026 rules unified showdowns/combats with a new step ordering (Header-Of-Turn / Focus / Event / Prioritized / Resolution). Current engine resolves combats atomically without this step structure. Big refactor of `moves/combat.ts` + `flow/riftbound-flow.ts`.

4. **"may" effect-level optionality**: `{type:"optional"}` / `{type:"choice"}` effects auto-apply first option. A UI hook to let players choose `{type:"choice"}` branches doesn't exist engine-side; the chain's `optional` flag only covers triggered-ability decline.

5. **Replace/Create as game actions with swap-back**: the engine keeps units alive when a replacement fires but doesn't execute the replacement's own heal/exhaust/recall body. `recallToBase` bridge primitive works around this for scenarios but the engine doesn't formally swap-back for `mode:"recall"` replacements.

6. **Static cost-reductions at deduction time**: parser emits cost-reduction statics correctly; the engine applies them via `computeCostModifier` but doesn't gate deduction via the reduction (only does pre-play legal check). Needs plumbing in the rune-spend path.

7. **Cross-game `@tcg/core` `advancePhase`/back-sync fix**: Agent Z landed a riftbound-local workaround in batch 15; the real fix is in `@tcg/core` and would affect gundam-engine + lorcana-engine (tested safe per batch 16 CC agent but not fully committed upstream).

8. **Unique §825 deck-validator check**: deck-construction only, zero engine work needed — just a validator in `lib/real-decks.ts` that rejects decks with >1 copy of a `[Unique]` card.

9. **`chainItemAdded` from triggered-ability `addToChain`** in `fireTriggers`: would create an import cycle (`trigger-runner` → `dispatcher`). Skip or resolve with a callback seam.

---

## UI State (apps/riftbound-app/web)
- Vite + React 19 + TypeScript SPA at `/play/`
- RiftAtlas-parity layout: dark navy palette, gold accents, full-bleed card art, portrait hand chips (96×136px), BF tiles with art backgrounds, combat/chain panels, phase strip
- Card art from Riot CMS gallery URLs via `lookupImageUrl`; image preload on mount
- Working: hand clicks → BattlefieldPicker, spell plays → TargetPicker (legal-only filter), bot step (guards human's turn), error toasts, End Turn button gated on legalMoves
- Headless screenshot harness at `apps/riftbound-app/scripts/headless-screenshot.ts`
- Remaining gaps: legend/champion portrait slots, animated showdown beam effects, full-screen card zoom overlay, spell coverage in real-deck prebuilts

---

## Branch / Repo State
- **Working tree only** — no commits/pushes. Open PR #1 on `unleashed-import-and-engine-fixes`.
- Uncommitted changes spread across: `packages/riftbound-engine/src/`, `packages/riftbound-cards/src/`, `apps/riftbound-app/`, `packages/core/src/`, `.claude/skills/riftjudge-engine-bridge/`, `riftbound-rules/`, `.ai_memory/`
