# Riftbound Rules Digest

> **Version**: `rules-db.json` is built from **Unleashed (2026-03-30)** — 2080 rules, 000-826. The engine's inline rule-number comments still cite the **June 2025** numbering (e.g. old 583.3 → new 382.x, old 627.4 → new 461.x); the behaviors are correct, only the citations are stale. Vendetta (2026-07-24) is one version newer and adds Empower/Flow/Burn/Skip — see `UNLEASHED-NOTES.md`.

Compact overview for engine work. **For any specific rule, use the lookup CLI — do not read the reference chunks:**

```bash
bun .claude/skills/riftbound-rules/scripts/rule.ts <id>          # e.g. 515.4.d, or 626 for the whole 626.* subtree
bun .claude/skills/riftbound-rules/scripts/rule.ts --grep <re>   # text search
bun .claude/skills/riftbound-rules/scripts/rule.ts --section <n> # whole section
bun .claude/skills/riftbound-rules/scripts/rule.ts --list        # section map
```

## Section map (2026-03-30 numbering → topic)

| § | Rules | Topic | Engine dir |
|---|---|---|---|
| 1 | 000–056 | Golden/Silver rules | — |
| 2 | 100–189 | Game concepts, cards & types, zones | `types/`, `zones/`, `deckbuilder/` |
| 3 | 300–324 | Turn structure, priority, focus, cleanup | `engine/`, `game-definition/flow` |
| 4 | 325–348 | Chains & showdowns | `chain/` |
| 5 | 349–359 | Playing cards | `game-definition/moves/cards.ts` |
| 6 | 360–406 | Abilities (passive/replacement/activated/triggered) | `abilities/` |
| 7 | 407–439 | Game actions (draw/exhaust/play/move/…/predict/prevent/create) | `operations/` |
| 8 | 440–453 | Movement & recalls | `game-definition/moves/movement.ts` |
| 9 | 454–467 | Combat & scoring | `combat/` |
| 10 | 468–484 | Layers, modes of play | `cleanup/`, `modes/` |
| 11 | 649–742 | Conceding, buffs, XP, attachment, special terms | — |
| 12 | 800–826 | Keywords (Accelerate…Vision + Equip/Quick-Draw/Repeat/Weaponmaster/Ambush/Hunt/Level/Unique/Backline) | `keywords/` |

## Turn phases (515–517)

`Awaken → Beginning (Hold scoring) → Channel (2 runes; second player's T1: 3, rule 644.7) → Draw (draw 1; Rune Pool empties) → Main → Ending (clear damage; Rune Pools empty)`

## Turn states (507–510)

| State | Showdown | Chain | Playable |
|---|---|---|---|
| Neutral Open | – | – | anything (your turn) |
| Neutral Closed | – | ✓ | Reaction |
| Showdown Open | ✓ | – | Action / Reaction |
| Showdown Closed | ✓ | ✓ | Reaction |

## Load-bearing definitions

- **Rune Pool** (159) is the *conceptual* Energy/Power counter, **not** the zone of rune cards. "Rune Pool empties" (160, 515.4.d, 517.2.c) resets the counter to 0; rune cards stay on board (154.1.a).
- **Chain** (532–544): LIFO stack; both pass → top resolves → priority resets → repeat.
- **Showdown** (545–553): opens when a battlefield becomes contested (548.2) or units move to an empty uncontrolled battlefield (516.5.b); it's a priority window before conquer resolves.
- **Combat** (626): attacker distributes damage first, then defender; both deal full summed Might; Tank must take lethal first (626.1.d.1); lethal = damage ≥ Might.
- **Scoring** (629–633): Conquer = gain control of a battlefield not scored this turn; Hold = control at Beginning Phase. Final-point Conquer only scores if you conquered *every* battlefield this turn (632.1.b.2). Victory: 8 (1v1/FFA), 11 (2v2).
- **Recycle** (594): card → bottom of its deck. Distinct from Rune Pool emptying.
- **Priority** (512) vs **Focus** (513): Focus is Showdown-state permission; gaining Focus grants Priority; passing Priority retains Focus.

## Zone targeting

| Zone | On board? | Targetable as "friendly unit"? |
|---|---|---|
| Base / Battlefield zones | yes | yes |
| Champion zone | no | no (must be played first) |
| Legend zone | no | no (except legend ability activation) |
| Hand / Deck / Trash / Banishment | no | only if effect names the zone |

## Common test-authoring traps

1. Conflating Rune Pool with rune-card zone — check 159 first.
2. Treating champion zone as "on the board".
3. Assuming simultaneous damage — attacker distributes first (626.1.d).
4. Forgetting optional triggers still fire (player declining is a separate step).
5. Asserting exact rune counts on turn 1 without accounting for 644.7 (+1 to second player).
6. Testing "prevent next X" without modelling one-shot vs turn duration.

## Deeper references (fallback only)

- `indexes/by-section/*.md`, `indexes/by-topic/*.md` — mid-weight summaries
- `references/*_Riftbound_Core_Rules_*.md` — full text (heavy; prefer `rule.ts`)
- `../engine-rules-audit/references/rules-primer.md` — expanded engine-test primer
