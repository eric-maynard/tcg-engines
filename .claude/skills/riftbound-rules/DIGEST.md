# Riftbound Rules Digest

Compact overview for engine work. **For any specific rule, use the lookup CLI — do not read the 172 KB reference chunks:**

```bash
bun .claude/skills/riftbound-rules/scripts/rule.ts <id>          # e.g. 515.4.d, or 626 for the whole 626.* subtree
bun .claude/skills/riftbound-rules/scripts/rule.ts --grep <re>   # text search
bun .claude/skills/riftbound-rules/scripts/rule.ts --section <n> # whole section
bun .claude/skills/riftbound-rules/scripts/rule.ts --list        # section map
```

## Section map (rule number → topic)

| § | Rules | Topic | Engine dir |
|---|---|---|---|
| 1 | 000–053 | Golden/Silver rules (card text > rules; card terminology) | — |
| 2 | 100–123 | Game concepts, deck construction, setup | `deckbuilder/`, `modes/` |
| 3 | 105–109 | Zones & spaces | `zones/` |
| 4 | 124–183 | Cards, types, control, rune pools | `types/`, `game-definition/` |
| 5 | 500–526 | Turn structure, priority, focus | `engine/`, `game-definition/flow` |
| 6 | 527–563 | Chains & showdowns | `chain/` |
| 7 | 564–585 | Abilities (passive/triggered/activated/replacement) | `abilities/` |
| 8 | 586–619 | Game actions (draw/exhaust/play/move/recycle/…) | `operations/` |
| 9 | 620–633 | Combat & scoring | `combat/` |
| 10 | 634–711 | Layers, modes of play, buffers | `cleanup/`, `modes/` |
| 11 | 712–729 | Keywords (Accelerate…Vision) | `keywords/` |

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
