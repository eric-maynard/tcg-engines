# Unleashed (UNL) — Repo Status vs Official Rules

_Investigation date: 2026-08-03_

## TL;DR

- All **225 UNL cards are already imported** on `staging` (`packages/riftbound-cards/src/cards/unl/`, registered in `sets.ts`).
- `rules-db.json` (1364 rules) is built from the **2025-06-02** Core Rules — **two major versions stale**. It is missing the entire Unleashed keyword block (Ambush, Hunt, Level, Backline, Quick-Draw, Repeat, Weaponmaster, Unique) and uses the pre-renumbering scheme.
- The **2026-03-30 "Unleashed" Core Rules** have already been extracted on the `unleashed-import-and-engine-fixes` branch (references + section-split + CHANGELOG), but that branch **never rebuilt `rules-db.json`** — the branch forked before `rules-db.json`/`rule.ts` existed.
- A **newer** official version now exists: **Vendetta Core Rules, effective 2026-07-24** (PDF dated 2026-07-16), adding Empower, Flow, Burn, Skip. If we rebuild `rules-db.json`, we should target Vendetta, not Unleashed.
- The `unleashed-import-and-engine-fixes` branch carries ~31k lines of engine work (Hunt/XP, Prevent, turn-queue/additional-turns, HOT-FEPR combat resolver, victory conditions, keyword-effects registry) that looks worth cherry-picking, but its tip is explicitly a WIP/abandon commit and it's 17 commits behind `staging`.

---

## 1. What's already in the repo (staging @ `7edb0ad`)

| Item | Status |
|---|---|
| UNL card definitions | 225 files in `packages/riftbound-cards/src/cards/unl/` + `index.ts` (226 total) |
| `sets.ts` entry | `UNL: { cardCount: 225, id: "UNL", name: "Unleashed" }` |
| `unl.json` set data | present |
| Rules references | **2025-06-02 only** (`references/*_2025_06_02.md`, 4 files) |
| `rules-db.json` | 1364 rules, §11 Keywords = rules 712–729 (13 keywords: Accelerate, Action, Assault, Deathknell, Deflect, Ganking, Hidden, Legion, Reaction, Shield, Tank, Temporary, Vision) |

## 2. What the `unleashed-import-and-engine-fixes` branch adds

Branch tip `5596e50`, merge-base `d776d58` — **46 commits ahead, 17 behind** staging.

### Rules content (directly reusable)
- `.claude/skills/riftbound-rules/references/*_2026_03_30.md` — 5 page-range files, verbatim PDF extraction
- `riftbound-rules/version-2026-03-30/` — 21 section-split .md files + `README.md` + `CHANGELOG-from-2025-06-02.md` (excellent, hand-authored delta summary)
- `.claude/skills/riftbound-rules/indexes/master-index.md` — updated header pointing at both versions
- **Did NOT touch `rules-db.json`** (file didn't exist when branch forked; added on staging in `7e694be`)

### Engine work (cherry-pick candidates)
`packages/riftbound-engine/`, `packages/core/`, `packages/riftbound-types/` — 139 files, +31,613 / −1,008. Notable new files:
- `operations/hunt-keyword.ts`, `operations/prevent-damage.ts`, `operations/turn-queue.ts`, `operations/static-cost-reduction.ts`, `operations/card-lookup.ts`
- `keywords/keyword-effects.ts`, `events/{dispatcher,game-event,listener-registry}.ts`
- `combat/damage-requirements.ts`, `game-definition/win-conditions/victory.ts`
- `cleanup/post-move-cleanup.ts`, `validators/deck-validators.ts`
- Heavy rewrites: `combat-resolver.ts`, `moves/combat.ts`, `moves/cards.ts`, `moves/chain-moves.ts`, `flow/riftbound-flow.ts`, `types/game-state.ts`

### App work (probably separate concern)
`apps/riftbound-app/` — riftatlas layout port, QA-reviewer iterations, Dockerfile fix, prod-deploy prep. Tip commit message: `chore(riftbound-app): iter-3 partial WIP — push and abandon workstream`.

### Card touch-ups
11 UNL card files modified on the branch (e.g. `diana-lunari.ts`, `ivern-friend-to-all.ts`, `mageseeker-investigator.ts`, `undying-legion.ts`) plus 4 OGN/SFD fixes. Also parser updates (`condition-parser.ts`, `effect-parser.ts`, `effect-keyword-parser.ts`).

## 3. New keywords the UNL set introduces

### Official keywords (Core Rules 2026-03-30 §800) new since our `rules-db.json`
`Equip` · `Quick-Draw` · `Repeat` · `Weaponmaster` · `Ambush` · `Hunt` · `Level` · `Unique` · `Backline`
(plus `Deflect` was formalized; already in our db as 721)

### New game actions / concepts (not keywords, but new rule numbers)
`Predict` · `Prevent` · `Replace` · `Create` · `XP` · `Dependent Keywords` / `[>]` symbol · `Inactive` abilities · `Responsibility` · `Linked abilities` · `Additional Turns` · `Copy effects` · `HOT FEPR` · `main phase` (rename) · `ending phase` (rename)

### Appearing in UNL card `rulesText` but absent from prior sets
`[Hunt]` (6 cards) · `[Predict]` (5) · `[Backline]` (7) · `[Stun]` (15, now an action-word backer) · `[Buff]` (8, now an action-word backer)

### Engine `keyword:` values used in UNL abilities not seen in OGN/SFD/OGS
Official: `Ambush`, `Deathknell`¹, `Legion`¹, `Shield`¹, `Temporary`¹, `Vision`¹
Engine-internal pseudo-keywords: `AmbushKillPet`, `AcceptsMoveFromAnywhere`, `CanPlayToEnemyBattlefield`, `CantMoveToBase`, `CantReady`, `CopyOnPlay`, `CostIncrease`, `DoubleIncomingDamage`, `ExhaustGainXp`, `HoldRepeatHere`, `SuppressTemporaryHere`
¹ already in `rules-db.json` §11 but first used as an engine `keyword:` value in UNL

## 4. Does `rules-db.json` need rebuilding?

**Yes — and target Vendetta, not Unleashed.**

- Current db: 2025-06-02 numbering (§1–§11, rules 000–729, 1364 entries).
- Unleashed (2026-03-30) **renumbered the whole document**: `000` foundation → `100` concepts → `300` playing → `700` additional → `800` keywords. Every cross-reference in the current db is stale against Unleashed-era cards.
- Missing from current db: 9 keywords + all the new §300/§700 mechanics above.
- **Newer version now live**: Vendetta Core Rules, effective **2026-07-24** ([patch notes](https://playriftbound.com/en-us/news/announcements/core-rules-vendetta-patch-notes/)). Current PDF on the [Rules Hub](https://playriftbound.com/en-us/rules-hub/) is dated **2026-07-16** ([direct PDF](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf)). Adds **Empower/Empowered/Disempower**, **Flow** (cast-from-trash alt-cost), **Burn** (mill), **Skip** (replacement of turn procedure).
- Recommendation: extract the Vendetta PDF → `references/*_2026_07_16.md`, rebuild `rules-db.json` from it, keep the branch's `CHANGELOG-from-2025-06-02.md` as a `references/CHANGELOG-2025-06-02→2026-03-30.md`, and author a second `CHANGELOG-2026-03-30→2026-07-16.md` from the Vendetta patch notes.

## 5. Is the `unleashed-import-and-engine-fixes` branch worth merging?

**Cherry-pick, don't merge whole.**

- The branch is 17 commits behind (missing `rules-db.json`/`rule.ts`, the playtest-observer skill, and all 14 engine bugfixes since `9644d8c`) — a straight merge would conflict on `combat-resolver.ts`, `moves/*.ts`, `rule-engine.ts`.
- Tip is self-declared WIP: `iter-3 partial WIP — push and abandon workstream`.
- Two independently valuable slices:
  1. **Rules references + CHANGELOG** (`riftbound-rules/version-2026-03-30/`, `.claude/skills/riftbound-rules/references/*_2026_03_30.md`, `indexes/master-index.md`) — clean adds, zero conflict risk, take as-is.
  2. **Engine mechanics** (`hunt-keyword.ts`, `prevent-damage.ts`, `turn-queue.ts`, `keyword-effects.ts`, `victory.ts`, `damage-requirements.ts`, `deck-validators.ts`, events/, `static-cost-reduction.ts`) — mostly new files; the rewrites of `combat-resolver.ts` / `moves/combat.ts` / `riftbound-flow.ts` will need manual reconciliation with staging's post-`d776d58` fixes.
- The `apps/riftbound-app/` riftatlas-port work and `scripts/{bot-tournament,random-monkey}/` are a separate workstream — evaluate independently.

## Sources

- [Rules Hub](https://playriftbound.com/en-us/rules-hub/) — current Core Rules PDF (2026-07-16)
- [Unleashed patch notes](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-core-rules-unleashed-patch-notes/) — 2026-03-30 changes
- [Vendetta patch notes](https://playriftbound.com/en-us/news/announcements/core-rules-vendetta-patch-notes/) — 2026-07-24 changes
- [Vendetta errata](https://playriftbound.com/en-us/news/announcements/vendetta-errata-updates/)
- Branch `unleashed-import-and-engine-fixes` @ `5596e50` — `riftbound-rules/version-2026-03-30/CHANGELOG-from-2025-06-02.md`
