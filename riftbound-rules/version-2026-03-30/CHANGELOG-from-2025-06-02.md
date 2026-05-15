# Changes from Core Rules 2025-06-02 → 2026-03-30 ("Unleashed")

Three Core-Rules updates landed between these versions:
- **2025-10-24** — Origins patch (first major patch)
- **2025-12-05** — Spiritforged patch (introduced "winning combat", "inactive text" machinery, FEPR)
- **2026-03-30** — Unleashed patch (the version imported here)

The biggest structural change: the rule-numbering scheme was reorganized. The doc now reads roughly:
`000 Golden/Silver` → `100 Game Concepts` (Game Objects/Cards/Units/Gear/Spells/Runes/Battlefields/Legends/Tokens/Control) → `300 Playing the Game` (Turn, Chains & Showdowns, Playing Cards, Abilities, Game Actions, Movement, Combat, Scoring, Layers, Modes) → `700 Additional Rules` → `800 Keywords`.

## New mechanics introduced by Unleashed (Set 3)

### XP / Hunt / Level (marquee mechanic) — rules §728–733, §823 (Hunt), §824 (Level)
- **XP** is a new per-player resource (rule §728+). Players can Gain and Spend XP; some abilities/costs spend XP like energy/power/buffs. XP is public info, tracked with counters/dice/the token-slot XP card. Not a Game Object.
- **Hunt** (keyword §823): "When I conquer or hold, gain 1 XP." A *Hunt Value* `[Hunt N]` gains N XP instead of 1. Multiple instances are additive.
- **Level** (keyword §824): a **Dependent Keyword**. `[Level N][>] [Text]` = "While you have N+ XP, this card gains '[Text]'." The bracketed Text is the *Dependent Ability*; it's Active while controller has ≥N XP, Inactive otherwise. Re-evaluates on controller change.

### Dependent Keywords + the `[>]` symbol — rules §726, §720 (Inactive)
- New formal category **Dependent Keyword** = a keyword (shorthand for a condition) + a *Dependent Ability* that's Active only while the condition holds; otherwise the ability is **Inactive** (effect doesn't apply, can't be triggered/activated).
- New templating symbol **`[>]`** ("arrowed word backer"): permissive/dependent keywords (*Reaction, Action, Deathknell, Level, Legion*) now appear at the start of the line, with `[>]` pointing to the ability they modify.
- **Legion** reworked as a dependent keyword using this machinery (clarifies prior confusion about scope/timing).

### Ambush — keyword §822
- "Bot gank" successor. A unit with **Ambush** has two passive abilities: (1) "I may be played to a battlefield where you control Units"; (2) "I have [Reaction] as long as I'm being played to a battlefield where you control Units." → conditional-permissive-keyword rules added (see below).

### Conditional permissive abilities (supports Ambush)
- A conditional permissive ability (e.g. conditional Reaction) may only be fulfilled while the card/ability is on the chain — it can still be played at the appropriate timing as long as doing so *could* fulfill the condition.
- If the chain item doesn't fulfill the condition by **Step 5: Check Legality**, the play/activation is undone and the card returns to the zone it was played from.

### New game actions
- **Predict** (§436): look at the top N cards of your main deck; recycle any number, put the rest back in any order. Codifies "look at top card, you may recycle it." Comes with new **Action Word Backers** (printed backers for *Predict, Stun, Buff* starting in Unleashed).
- **Prevent** (§437): prevent damage — both a game action and a delayed replacement effect; creates a pool of prevented damage acting as a shield. (Cards from Origins/Spiritforged said "prevent" before the mechanism existed.)
- **Replace** (§438): replace a game object with a token; the replaced object goes where banished cards go; the replacing token inherits all effects/statuses. Replaced objects can sometimes be **swapped back**.
- **Create** (§439): a token is *created* directly in the appropriate zone without using the chain (primarily supports Replace).

### Copy effects
- Copy effects copy the **copyable traits** of an object = its printed/copied traits including Rules Text; nothing appended or granted. Copying a copy → copies the original. (First true copy effect appears in Unleashed.)

### Responsibility — rule §411
- A player is **responsible** for a game action if they performed it or were assigned responsibility (e.g. via a deal action attributed a kill). Needed for "when you kill a unit with a spell"-type conditions and to shore up Immortal Phoenix.

### Linking — §393 (Linked Abilities), §407+ (linked instructions)
- **Linked instructions/abilities**: instructions/abilities that reference or are referenced by another. A later linked instruction only executes if its earlier linked instruction executed; replacing a game action in the earlier instruction doesn't affect the later one. Important for repeated spells (e.g. repeated Hidden Blade) and ability cross-references.

### Referents
- Referential words ("here", "my", "its") are checked when the spell/ability **resolves**; references to the *trigger condition* are checked when the ability triggers and is placed on the chain.

### Additional Turns — §734
- An additional turn is owned by the player told to take it and inserted directly after the current turn in the repeating turn queue; turn *order* is unaffected; after it finishes it's removed from the queue. (Settles Time Warp.)

### New keywords (glossary §800)
- **Deﬂect** (§809) — new keyword (carried over from Spiritforged-era cards; now in glossary).
- **Quick-Draw** (§819) — equipment-related (with Equip §818).
- **Repeat** (§820) — repeat a spell's instructions; works with linked instructions.
- **Weaponmaster** (§821).
- **Ambush** (§822), **Hunt** (§823), **Level** (§824) — see above.
- **Unique** (§825) — a deck-construction permission: a deck may contain only one card of a given name if it has Unique (Signature+Unique → up to three Signature cards total but ≤1 of each named Unique). No gameplay effect.
- **Backline** (§826) — a Passive Ability keyword on units: "I must be assigned lethal damage after any other unit with my controller that doesn't have Backline during the Combat Damage step." Multiples redundant. (Caitlyn, Patrolling / Soraka, Wanderer ability turned into a keyword.)

## Rules changes (functional/structural, not new mechanics)

- **Winning the game**: you win if, during a *cleanup*, you have points ≥ Victory Score **and** more than any opponent (both required). Exception: if you gain ≥2 points from burn-outs processed in sequence and meet those conditions, you win immediately without waiting for a cleanup.
- **Combats ↔ Showdowns unified**: a showdown opens whenever a battlefield is *contested* and there's a unit there whose controller doesn't control it; if units controlled by different players are present it's a *combat showdown*, else a *non-combat showdown*. A non-combat showdown becomes a combat showdown in the next cleanup if a combat becomes staged there. (Showdowns staged at contested battlefields; combats staged at contested battlefields with units of different controllers.)
- **Combat Resolution Step reorganized** (uses HOT FEPR): Combat Cleanup heals units & recalls attackers → determine winner/loser → if units of different controllers remain (or none remain) the combat has "no result", else the player with units remaining wins → conquer if applicable → drop attacker/defender designations & "this combat" effects expire.
- **"May" triggered abilities**: now *optional* to place on the chain (controller chooses when the trigger condition is fulfilled).
- **Costs within instructions** ("[do X] to [do Y]"): the "[do X]" cost is now the base cost of the triggered ability and must be paid to finalize it onto the chain.
- **HOT FEPR**: the FEPR process is now "**H**andle **O**utstanding **T**asks; then **F**inalize **E**xecute **P**ass **R**esolve." Tasks = turn procedures (cleanups, start-of-turn, combat procedures, end-of-turn). When tasks are outstanding, the FEPR loop pauses until they're handled.
- **Cleanups**: finalization removed from cleanups (moved into HOT FEPR — pending chain items are no longer finalized during cleanups). Combat designations are removed/added *before* units die to marked damage in a normal cleanup. A unit is "in combat" iff it occupies a battlefield with ongoing combat and has an appropriate combat designation.
- **Ending phase** (was "End of Turn phase"): renamed. The End-of-Turn Cleanup is folded into the **Expiration Step**, which now **loops** — if any items underwent FEPR during it, return to its start.
- **Replacement effects** beefed up: controller of multiple simultaneous replaceable events chooses the order of application; each replacement effect applies in only one uninterrupted sequence; the controller of a replacement effect = the player controlling its source; if a replaced event would be modified by a game effect/action, the replacement effect inherits those modifications.
- **Control of battlefields**: control is locked by the *presence of a combat or showdown* at the battlefield (not by contested status). A player with no units at a battlefield loses control in the following cleanup unless a combat/showdown is ongoing there; control can't be lost while there's an item on the chain.
- **Discounts to cost components**: discounts that affect only a component of a cost apply as soon as that component is added to the total, before other discounts.
- **Main Phase**: the "action phase" is renamed the **main phase** (to disambiguate from game actions / action keyword).
- **Attaching**: attaching a card to its current top-most card now does nothing (aligns Attach with ready/stun/exhaust); attaching to a *new* top-most card detaches from the current one.

## What I did NOT change
- `version-2025-06-02/` left intact.
- The `riftbound-rules/IMPLEMENTATION-PLAN.md`, `PROGRESS.md`, `RULES-ENFORCEMENT-PLAN.md`, `cards/` not modified.
