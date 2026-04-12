# Riftbound TCG Rules Guide

> **Source:** This guide is derived exclusively from a video transcript of a full Riftbound rule book breakdown. Timestamp references [MM:SS] are provided so readers can jump to the original video for additional context. No other sources were consulted.

---

## Table of Contents

1. [Deck Building](#1-deck-building)
2. [Game Setup](#2-game-setup)
3. [Zones](#3-zones)
4. [Game Objects](#4-game-objects)
5. [Turn Structure](#5-turn-structure)
6. [The Rune System](#6-the-rune-system)
7. [Playing Cards & Costs](#7-playing-cards--costs)
8. [Abilities](#8-abilities)
9. [The Chain](#9-the-chain)
10. [Showdowns & Combat](#10-showdowns--combat)
11. [Scoring & Winning](#11-scoring--winning)
12. [Keywords](#12-keywords)
13. [Game Actions Reference](#13-game-actions-reference)
14. [Control & Relevance](#14-control--relevance)
15. [Layers](#15-layers)
16. [Game Modes](#16-game-modes)
17. [Conceding](#17-conceding)

---

## 1. Deck Building

### Champion Legend [00:21]

Every deck requires a **champion legend**, placed in the legend zone at the start of the game. The legend determines your **domain identity** -- the colors (domains) of cards you are allowed to include in your deck.

- A legend displays one or more domain icons in its top-left corner.
- Your deck may only contain cards from the domains shown on your legend.
- If a card has **two domains**, your legend must match **both** of them to include that card. [00:51]
- To date, each champion legend has exactly two domains. [12:02]

**Example:** Jinx Loose Cannon has red (Fury) and purple (Chaos) icons, so the deck can only use Fury and Chaos cards. [00:38]

### The Six Domains [00:58]

| Domain | Color |
|--------|-------|
| Fury | Red |
| Chaos | Purple |
| Calm | Green |
| Mind | Blue |
| Body | Orange |
| Order | Yellow |

### Main Deck [01:07]

- Minimum **40 cards**.
- Contains units, gears, spells, and one chosen champion unit.
- All cards have a **cap of three copies** per card name (full name, not partial). [02:15]
  - Example: "Jinx Demolitionist" and "Jinx Rebel" are unique card names despite both being "Jinx." [06:12]

### Chosen Champion [01:16]

- Placed in the champion zone at the start of the game.
- Must have a **tag** matching your champion legend.
- Must specifically be a **champion unit**, not just any card with the matching tag.

**Common mistake:** A card like Tibbers has the "Annie" tag but is a *signature unit*, not a champion unit, so it cannot be your chosen champion for an Annie legend. [01:44]

### Signature Cards [01:54]

- Your deck may include a **maximum of three** signature cards total.
- Signature cards must share a tag with your champion legend.
- If a champion has multiple signature cards available, you choose any combination that totals at most three copies. [02:07]

### Rune Deck [02:21]

- A separate deck of exactly **12 runes**.
- Runes must match your domain identity.

### Battlefields [02:31]

- You must provide battlefields as part of your deck list.
- The number depends on the game mode; typically **three** in a 1v1. [02:35]
- Battlefields are not shuffled into any deck -- they exist only to be selected from during setup. [11:23]

---

## 2. Game Setup

### Setup Procedure [13:30]

1. Each player places their **champion legend** in the legend zone.
2. Each player places their **chosen champion** in the champion zone.
3. Each player **randomly selects** one of their battlefield cards and places it in the battlefield zone. [13:43]
4. Set main deck and rune deck in their respective zones.
5. Determine who goes first by any fair method (coin flip, dice roll, etc.). [13:50]
6. In games with 3+ players, turn order follows **clockwise table seating** after the first player. [13:58]
7. Each player draws **four cards**. [14:04]
8. Each player may **mulligan up to two cards** -- choose up to two cards to recycle (place at the bottom of the main deck), then draw that many replacements. [14:06]

---

## 3. Zones

### Board Zones [02:42]

| Zone | Description |
|------|-------------|
| **Base** | Main location for playing units and gear. Runes are technically in the base as well, though they may be visually separated for clarity. [02:45] |
| **Battlefield Zone** | Where battlefields are placed, typically one per player. [02:59] |
| **Facedown Zone** | A subzone of each battlefield; holds a single face-down card placed through effects like Hidden. Only the player controlling the associated battlefield may place cards here. If control is lost, the hidden card is removed. [03:06] |
| **Legend Zone** | Where the champion legend is placed. Not considered a "location." The legend cannot be removed or displaced during the game for any reason. [03:24] |

### Non-Board Zones [03:37]

| Zone | Description |
|------|-------------|
| **Trash** | Equivalent to a graveyard. Cards go here when killed, destroyed, discarded, or after a spell resolves. Can be freely reorganized. **Public information** -- opponents may ask to see it. A player's cards can never enter another player's trash. [03:39] |
| **Banishment** | Where banished cards go -- harder to recover than the trash. Also **public information**. [04:07] |
| **Hand** | Cards are **private**, but the **number of cards** is public information. [04:24] |
| **Champion Zone** | Holds the chosen champion. Once a champion leaves this zone, it typically cannot return. If the champion is played and then killed, it goes to the trash. [04:57] |
| **Main Deck Zone** | The main draw deck. [05:12] |
| **Rune Deck Zone** | The rune draw deck. [05:14] |

### Information Rules [04:32]

- All items on the board (the collective play area) are **public information**.
- Players may ask to view details of any face-up card in play. [04:37]
- Card state (e.g., buffed, exhausted) is also public. [04:51]
- The top of your deck is **secret** -- you cannot voluntarily show it. [39:54]
- You **can** voluntarily show private information (like cards in hand) to other players, but this is not considered "revealing" for game effect purposes. [39:32]

---

## 4. Game Objects

### Card Types

#### Units [06:43]

- Have **might** (top-right corner), which serves as both attack power and health. [07:09]
- When dealt damage, the damage is marked. If marked damage **equals or exceeds** might, the unit is killed. [07:15]
- Might also determines how much damage a unit deals in combat. [07:21]
- A unit's might can never go below zero. [07:39]
- Enter the board **exhausted** (tapped/horizontal) unless affected by Accelerate or similar effects. [07:43]
- Remain exhausted until readied in the player's next awaken phase or by another effect. [07:55]
- Have an inherent **standard move** ability (see Section 13). [08:20]
- May have tags (champion, region, faction, species). Tags generally have no intrinsic value but can be referenced by other cards. [06:45]
- Can only be played to a location **under your control**. [24:46]

#### Gear [09:04]

- Can only be played in a player's **base**. [09:07]
- If somehow moved to a battlefield, immediately recalled to base in the next cleanup. [09:09]
- Enters the board **readied** (unlike units). [09:20]
- Can have activated abilities usable in open states. [09:15]

#### Spells [09:28]

- Played, put on the chain, resolve, then sent to the **trash**. [09:30]
- Resolve rules text from **top to bottom**. [09:36]
- Once a spell begins resolving, nothing else can interrupt or resolve until all effects are completed. [09:39]
- By default, can only be played in **open game states**. [09:28]
- Two keywords modify this: **Action** (playable during showdowns) and **Reaction** (playable during closed states). [09:54]

#### Runes [10:19]

- Channeled from the rune deck rather than played from hand.
- Typically stay on the field but are **not** considered permanents (they do not come from the main deck). [10:22]
- Primary resource for paying costs. See Section 6 for details.

#### Battlefields [11:02]

- May have passive or triggered abilities that affect units and spells at that location. [11:04]
- Cannot be moved or killed in most cases. [11:31]
- You can stack **any number of units** on a single battlefield. [11:36]
- Only **one** hidden card slot per battlefield. [11:39]

**Examples:**
- Sigil of the Storm: triggers when conquered, makes you recycle a rune. [11:10]
- Arena's Greatest: passively gives each player a point during their first beginning phase. [11:17]

#### Champion Legend [11:43]

- Stays in the legend zone; cannot leave, cannot be killed. [11:50]
- **Can** be targeted by spells or game effects. [11:52]
- May have passive, triggered, or activated abilities. [11:57]

### Tokens [12:06]

- Not actual cards -- created during the game by effects.
- Can be represented by pre-established token cards, coins, dice, or any physical object. [12:15]
- Not technically considered "cards" and have no costs or domains. [12:32]
- Can have tags, types, might, or other properties as specified by the creating effect. [12:38]

### Permanents [06:23]

- Cards from the main deck that remain on the board after being played: **units** and **gear**.
- Spells are **not** permanents.
- Runes are **not** permanents (they come from the rune deck, not the main deck). [10:24]

---

## 5. Turn Structure

### Overview [16:46]

Each turn proceeds through phases abbreviated as **ABCD** + Action + End:

| Phase | Name | Summary |
|-------|------|---------|
| A | **Awaken** | Ready all your game objects [16:51] |
| B | **Beginning** | Beginning-step triggers fire (e.g., hold scoring, legend abilities) [17:01] |
| C | **Channel** | Add runes from rune deck to board [17:16] |
| D | **Draw** | Draw one card; rune pools emptied [17:44] |
| -- | **Action** | Main phase -- discretionary actions in any order [18:43] |
| -- | **End** | Cleanup, expire "this turn" effects, clear damage, empty rune pools [19:05] |

### Phase Details

#### A -- Awaken Phase [16:51]

The turn player readies **all** of their game objects that can be readied.

#### B -- Beginning Phase [17:01]

All beginning-step triggers take place. Key events:
- **Holding** a battlefield scores a point (controlling a battlefield at your beginning phase). [17:05]
- Legend abilities that trigger at the beginning phase fire here.

**Example:** Jinx Loose Cannon allows drawing a card if you have **one or fewer** cards in hand during this phase. [17:09]

#### C -- Channel Phase [17:16]

- The turn player channels runes from the top of their rune deck onto the board.
- Typically **two runes** per turn. [17:22]
- If the rune deck has fewer than two runes, channel as many as possible. [17:36]
- Special first-round rules vary by game mode (see Section 16).

#### D -- Draw Phase [17:44]

- The turn player draws **one card**. [17:45]
- **Burn Out:** If the main deck is empty when a player tries to draw, they: [17:50]
  1. Shuffle their trash into their main deck.
  2. Choose an opponent to gain a point.
  3. Perform the action that caused the burn out (i.e., draw).
- If the trash is also empty during burn out, the burn out **repeats** -- the player keeps choosing opponents to give points to until something stops it (e.g., someone wins). [18:05]
- At the **end** of the draw phase, each player's **rune pool is emptied**. [18:36]

> **Design note:** In 3+ player games, repeated burn outs effectively let the burning-out player choose which opponent wins, though this scenario should be very rare. [18:22]

#### Action Phase [18:43]

- No fixed structure. The turn player takes **discretionary actions** in any order.
- Actions include: playing cards, casting spells, moving units, triggering showdowns/combats, activating abilities.
- Continues until the turn player chooses to stop (or has no more legal actions).

#### End Phase [19:05]

All of the following occur:
- All "this turn" effects expire simultaneously. [19:07]
- All marked damage on units is cleared. [19:11]
- All rune pools are emptied. [19:13]
- A cleanup is performed. [19:17]

### Cleanup [19:17]

Cleanup is a board review that happens at multiple points (end of turn, after chain resolution, after showdown completion). During cleanup:

- Units no longer in combat lose attacker/defender status. [19:30]
- Units with marked damage equal to or exceeding their might are killed. [19:34]
- Hidden cards at battlefields not controlled by their controller are removed to the trash. [19:39]
- Gear at battlefields is recalled to the controller's base. [43:52]
- The game checks if any battlefields have units from two different players (which would trigger a pending combat). [19:48]
- If multiple battlefields have pending combats, the **turn player** chooses resolution order. [20:05]

---

## 6. The Rune System

### Channeling [17:16]

- During the channel phase, the turn player places the top cards of their rune deck onto the board.
- Standard rate: **two runes per turn**.
- Runes enter the base zone (technically).

### Producing Energy [10:30]

- **Exhaust** (tap) a rune to produce **one energy**.
- Energy is stored in the **rune pool**.
- Energy can be used to pay energy costs on main deck cards or activated abilities.

### Producing Power [10:41]

- **Recycle** a rune (return it to the bottom of the rune deck) to produce **power**.
- A rune can only produce power of its **associated domain** or **generic power**. [10:47]
- Power is stored in the rune pool.

### Rune Pool [10:52]

- Stores both energy and power until spent.
- The rune pool is emptied at:
  - The end of the **draw phase**. [10:57]
  - The end of the **turn** (end phase). [19:13]

### Double-Dipping [28:09]

Costs can be paid in any order. This means you can exhaust a rune for energy first, then recycle that same (now exhausted) rune for power, effectively getting both energy and power from one rune.

**Example:** To play Captain Faren (costs four energy + one Fury power), you could exhaust four runes, then recycle one of those exhausted Fury runes for the power cost. [28:16]

---

## 7. Playing Cards & Costs

### Cost Structure [05:44]

Each main deck card has a cost in the top-left corner consisting of:
- **Energy cost** -- the number in the large circle. [05:51]
- **Power cost** -- rune symbols displayed below the energy cost (not always present). [05:58]

### Playing Procedure [24:30]

1. Remove the card from its current zone (hand, trash, etc.).
2. Place it onto the chain (this closes the game state). [24:39]
3. For units: choose a location under your control to place them. [24:44]
4. For cards requiring targets: select targets now. [24:48]
5. Pay all costs.
6. The card resolves according to chain rules.

**Important exception for triggered abilities on permanents:** If a unit has a triggered ability like "when I am played, kill a unit," you do **not** choose the target until the unit actually resolves and is on the board. [24:52]

### Targeting [25:08]

- When a card selects a specific game object to affect, it is **targeted**. [25:10]
- If **all** targets become invalid (mis-targeting), the card does not activate. [25:13]
- If **some** targets remain valid, the card resolves with the available targets only. [25:22]
- Even if a card fails due to all targets becoming invalid, it is still considered "played" and relevant trigger effects still apply. [25:30]

### Split Damage [25:41]

- For effects like "split five damage," choose any number of targets up to the damage amount.
- Actual damage allocation is not decided until the spell/ability resolves. [25:47]
- If a target becomes invalid, redistribute remaining damage freely among valid targets. [26:00]
- If total damage is reduced, choose which targets still receive damage. [26:11]

### Partial Resolution [30:40]

- If instructions cannot be followed (illegal targets/circumstances), they are **ignored**. [30:56]
- If instructions can be **partially** followed, follow them as much as possible and ignore the rest. [31:02]

**Example:** Scrapyard Champion's legion effect says "discard two, then draw two." If your hand is empty, skip the discard and still draw two. If you have one card, discard one and still draw two. [31:10]

### Separate Effects on Cards [30:34]

Each effect on a card is independent. If one effect cannot resolve, other separate effects still do.

**Example:** Void Seeker reads "Deal four damage to a unit at a battlefield. Draw one." If the unit is removed and the damage fizzles, the draw still happens. [30:37]

### Card Identity Across Zones [29:35]

If a card leaves the board to a non-board zone (e.g., returned to hand) and then re-enters the board, it is **no longer considered the same object**, even if it is physically the same card. [29:40]

However, if a card moves between board zones only (e.g., base to battlefield and back), it retains its identity. [29:48]

### Checking Card Details After Removal [31:26]

If a spell references a property of a card (e.g., "deal damage equal to its might") and that card is removed before the check, the value defaults to **zero**. [31:33]

**Example:** Last Breath readies a friendly unit and deals damage equal to its might. If the readied unit is returned to hand before the damage check, Last Breath deals zero damage. [31:39]

### Cost Modification [26:54]

- **Ignoring cost:** Sets the base cost to zero. [26:56]
  - "Ignore the cost" = no energy or power required.
  - "Ignore the energy cost" or "ignore the power cost" = only the specified component is zeroed out. [27:07]
- **Additional costs** (e.g., Accelerate) must still be paid even when the base cost is ignored. [27:16]
- **Discounts/increases** can be applied by other effects. If no limit is stated, a card's cost can be reduced to zero. [28:04]

### Mandatory vs. Optional Costs [27:36]

- If a cost uses the word **"may"**, it is optional (e.g., Accelerate). [27:42]
- If a cost does **not** use "may," it is mandatory (e.g., Cruel Patron requires killing a friendly unit). [27:40]
- You cannot play a card if you cannot pay its mandatory costs.

### Legality Must Be Maintained [26:21]

Legality is checked at **every step** of playing a card. A card must have legal targets to be played, and those targets must remain legal throughout.

**Example:** Cruel Patron requires killing a friendly unit. If your only unit is on a battlefield, you cannot sacrifice it and then play Cruel Patron to that battlefield -- because sacrificing the unit means you no longer control the battlefield, making it an illegal destination. [26:29]

---

## 8. Abilities

### Types of Abilities [31:59]

There are four types: passive, replacement effects, activated, and triggered.

A card can have multiple abilities, including multiple types. [32:12]

#### Passive Abilities [32:16]

- Conditions, rules, constraints, or factual statements that affect regular play.
- Appear as statements of fact (e.g., "Friendly Yordles at my battlefield have Shield"). [32:26]
- Can be conditional using "if" or "while" (e.g., "If an opponent controls a battlefield, I enter ready"). [32:33]
- On permanents, typically only active while the permanent is on the board. [32:40]
- Some passive abilities work from non-board zones (e.g., "Play me only during an opponent's turn" works from hand). [32:46]

#### Replacement Effects [32:52]

- Abilities that change or alter how another game effect or rule is applied.
- Identified by the word **"instead"** in the rules text. [33:09]
- Not exclusive to one ability type -- both passive and triggered abilities can be replacement effects. [33:02]

**Example:** Zhonyas Hourglass: "The next time a friendly unit would die, kill this instead. We call that unit exhausted." [33:12]

- If multiple replacement effects apply to the same event, the **owner of the affected object** decides the order. [33:26]
- If the affected object is a player, that player decides. [33:34]
- If the affected object is an uncontrolled battlefield, the **turn player** decides. [33:36]

#### Activated Abilities [33:42]

- Repeatable effects with a cost, formatted as **cost : effect** (separated by a colon in the rules text). [33:56]
- Activation functions like playing a card: declare the ability, pay the cost, then a chain is created. [33:48]
- Typically found on permanents on the board. [34:21]
- Can generally only be used on the **controlling player's turn** during an **open state**. [34:26]
- Cannot be used as a reaction unless the ability specifically has the Reaction keyword. [08:08]

**Example:** Raven Born -- Gear with activated ability. Cost (before colon): exhaust Raven Born. Effect (after colon): your next spell deals one bonus damage. [34:07]

#### Triggered Abilities [34:31]

- Repeatable effects that fire when a specific condition is met.
- Identified by **"when"** or **"at"** in rules text (e.g., "when you conquer," "at your end step"). [34:39]
- When triggered, placed on the **chain**. [34:44]
- Unlike activated abilities, can trigger in **both open and closed states**. [34:49]
- If multiple triggered abilities fire simultaneously for one player, that player chooses the chain order. [34:54]
- If multiple players' triggered abilities fire simultaneously, the **turn player's** abilities go on the chain first, then proceed in turn order. [35:01]

---

## 9. The Chain

### Overview [21:39]

A chain is created whenever a card or ability is activated. Cards/abilities remain queued on the chain until resolved. If a new card is played while a chain exists, it is added to the existing chain.

The chain is analogous to **Magic: The Gathering's stack** (LIFO -- last in, first out), not Yu-Gi-Oh's chain mechanic. [23:20]

### Chain and Game State [23:27]

- While a chain exists, the game is in a **closed state**. [23:29]
- In a closed state, only cards/abilities with the **Reaction** keyword can be played. [23:31]
- When no chain exists, the game is in an **open state**. [23:36]

### Chain with Permanents [21:54]

When the card creating a chain is a **permanent** (unit or gear), no player receives priority until it actually resolves and is on the board. [21:56]

### Priority During a Chain [22:01]

1. The player who creates the chain becomes the first **active player**. [22:01]
2. The active player can play a legal spell or activate an ability (typically needing Action or Reaction). [22:05]
3. If the active player cannot or chooses not to add to the chain, active player status passes to the **next relevant player** in turn order. [22:14]
4. This continues until **all relevant players** have passed without adding to the chain. [22:21]

### Triggered Abilities on the Chain [22:26]

If a triggered ability fires while a chain is in progress, it becomes the **most recent item** on the chain without affecting the active player order. The controller of the triggered ability also becomes a relevant player. [22:30]

### Chain Resolution [22:43]

1. The **last** (most recent) item on the chain resolves first. [22:45]
2. Resolution can itself trigger abilities, which are added to the chain. [22:50]
3. After each resolution, a **cleanup** is performed. [22:55]
4. The controller of the next most recent item becomes the active player. [22:57]
5. All relevant players get another opportunity to add to the chain. [23:01]
6. This loop continues until the chain is empty. [23:06]

**Key point:** After each link resolves, all players have an opportunity to add new items before the next link resolves. [23:08]

---

## 10. Showdowns & Combat

### Game States [14:50]

The game has two orthogonal state axes:

| | Open | Closed |
|--|------|--------|
| **Neutral** | Default state. Discretionary actions allowed. | A chain is active. Only Reaction cards/abilities. |
| **Showdown** | Showdown in progress, no active chain. Action and Reaction cards. | Showdown in progress with active chain. Only Reaction cards. |

- Only the **turn player** can take discretionary actions (neutral open). [15:47]
- During showdowns, cards with **Action** or **Reaction** can be played. [15:02]

### Showdowns [16:12]

A showdown occurs in two situations:
1. A **combat** takes place (units from opposing players on the same battlefield). [16:14]
2. A unit is moved to an **empty battlefield** (one the mover does not control). [16:20]

**General rule:** If something enters a battlefield that its owner does not control, it is typically a showdown. [16:22]

#### Showdown Procedure [23:45]

1. The player who contested the battlefield gains **focus**. [23:47]
2. Attacking and defending players are made **relevant**. [23:51]
3. If the showdown involves no combat, **all players** are made relevant. [23:53]
4. An **initial chain** may be created from "when I attack" or "when I defend" triggers. [24:00]
   - If multiple triggers fire, they are added in turn order. [24:09]
   - If triggers exist, the state closes. [24:21]
   - If no triggers, the showdown is in open state. [24:24]
5. After the initial chain resolves, **focus passes** to the next relevant player, who gains focus and priority. [24:14]
6. From here, regular chain rules apply.

### Combat [44:43]

Combat occurs when a cleanup finds units belonging to **two separate players** on a single battlefield, or when a unit moves to a battlefield occupied by an opponent's units.

- Combat can only occur between **two players**. [44:07]
- If a situation would cause three or more players to be in combat, it is made **invalid**. [44:11]
- If a unit would be played at a battlefield with a pending/active combat where the unit's controller is not a participant, the unit goes to the **controller's base instead**. [44:16]

#### Steps of Combat [44:43]

**Step 1 -- Showdown Step** [44:48]

1. A showdown opens; attacker and defender are established.
   - The **attacker** is the player who applied contested status (typically the one moving units onto the battlefield). [44:54]
2. Static combat abilities are applied (e.g., Assault on attackers, Shield on defenders). [45:06]
3. An initial chain is created if relevant units have "when I attack" or "when I defend" triggers. [45:16]
4. Players with focus/priority may play legal spells and abilities.

**Step 2 -- Combat Damage Step** [45:29]

1. Calculate the **total might** of all attacking units. [45:35]
2. Calculate the **total might** of all defending units. [45:37]
3. Starting with the attacker, each player distributes damage equal to their total might among the other player's units. [45:40]
4. **Tank** units must be assigned **lethal damage** before non-Tank units can be targeted. [45:45]
5. In general, units must be assigned lethal damage in full before damage can overflow to another unit. [45:58]
6. If multiple Tank units exist, the opposing player chooses which to assign damage to, but non-Tank units are still protected. [46:09]
7. Stunned units do **not** contribute their might to damage, even if present at the battlefield. [38:55]

**Step 3 -- Resolution Step** [46:15]

1. Units with lethal damage (marked damage >= might) are removed (killed). [46:17]
2. If both attacking and defending units remain, the **attacking units are recalled** to their base. [46:20]
3. The battlefield is considered **conquered** if no defending units remain while attacking units do. [46:27]
4. If conquered, **control of the battlefield changes** to the attacker. [46:34]
5. Contested status is cleared. [46:36]
6. All marked damage is removed from units at **all locations** (not just the battlefield). [46:40]

### Movement Rules [42:31]

- Units may move from **base to battlefield** or **battlefield to base**. [08:42]
- Units **cannot** move from one battlefield to another unless they have **Ganking** or a spell allows it. [08:47]
- Units cannot move to a battlefield already occupied by **two other players** (relevant in 3+ player games). [08:54]
- Moving is **instant** -- there is no in-between state. [43:04]
- Moving does **not** use the chain and cannot be reacted to. [43:12]
- Moving **can** trigger a showdown depending on the destination. [43:18]
- **Standard Move**: All units have an inherent ability to move by exhausting themselves. Multiple units can move simultaneously, but all must go to the **same destination** (origins can differ). [08:23]

### Recalls [43:37]

- A recall is when a permanent changes location **without** it being considered a "move."
- Recalls do **not** trigger move-based effects and cannot be blocked by movement restrictions. [43:41]
- **Corrective recall**: If a unit is in an illegal position (e.g., battlefield with two other players), it is forced back to the base. [42:38]

---

## 11. Scoring & Winning

### Scoring Methods [46:46]

Players can score points in two ways:

1. **Conquering** -- Taking control of a battlefield by winning combat there (only scores if you haven't already scored on that battlefield this turn). [46:51]
2. **Holding** -- Controlling a battlefield during your **beginning phase**. [46:58]

**Limit:** Each battlefield can only grant a player **one point per turn**, regardless of method. [47:04]

### The Final Point [47:09]

Special restrictions apply to scoring the **winning point**:

- If attempting to score the final point by **conquering**: you must have scored on **every battlefield** (by either method) this turn. If you haven't, you **draw a card** instead of scoring. [47:11]
- **Alternate point sources** (e.g., Trendir Barbarian's effect) can always score the final point regardless of the above restriction. [47:31]

### Winning [47:38]

Once a player reaches the required number of points (typically **8** in a 1v1 duel), they win the game. The required total varies by game mode.

### Burn Out as Scoring [17:50]

When a player burns out, an **opponent gains a point**, chosen by the burning-out player. This can potentially end the game.

---

## 12. Keywords

Keywords are shorthand abilities with colored highlights on cards. [54:33] Listed alphabetically:

### Accelerate [54:44]

- **Type:** Unit ability (additional cost)
- **Effect:** When playing the unit, you may pay **one energy + one power** as an additional cost to have the unit enter **readied** instead of exhausted. [54:48]
- Cannot be paid after the unit is already on the board. [54:57]
- The Accelerate cost is not reduced by effects that ignore the base cost. [27:27]

### Action [55:04]

- **Type:** Permissive keyword
- **Effect:** Allows the card to be played or activated during **showdowns**, even if it isn't the controlling player's turn. [55:09]
- Not restricted to showdowns -- can also be used at any normal legal timing. [55:18]

### Assault [55:25]

- **Type:** Passive keyword (units)
- **Format:** Assault followed by a number (default **1** if no number shown). [55:29]
- **Effect:** While the unit is **attacking**, it gains might equal to the Assault value. [55:33]
- **Example:** Assault 3 grants +3 might while attacking. [55:37]
- Multiple instances of Assault are **added together**. [55:41]

### Death Knell [55:45]

- **Type:** Triggered ability (permanents)
- **Trigger:** When the permanent dies. [55:47]
- **Format:** "Death Knell -- [effect]" [55:49]
- Each Death Knell on a card triggers **separately**. [55:56]
- If a card has multiple Death Knells, the controller chooses the order. [56:01]

### Deflect [56:05]

- **Type:** Passive ability
- **Format:** Deflect followed by a number. [56:09]
- **Effect:** Spells and abilities controlled by an **opponent** that target a unit with Deflect must pay additional **power** equal to the Deflect value. [56:11]
- The power required is **generic** -- any domain can pay it. [56:26]
- Multiple instances of Deflect are **added together**. [56:33]

### Ganking [56:39]

- **Type:** Passive ability (units)
- **Effect:** Allows the unit to move from **one battlefield to another** (normally illegal). [56:41]
- This is an added permission to the standard move ability. [56:45]

### Hidden [56:50]

- **Type:** Keyword (spells, units, gear)
- **Effect:** Instead of paying the normal cost, pay **one power** to place the card **face down** at a battlefield you control that doesn't already have a hidden card. [57:00]
- Starting on the **next player's turn**, the hidden card gains a **Reaction ability** allowing you to play it while **ignoring its base cost**, provided timing and targets are legal. [57:11]
- A hidden card can still be played for its normal cost at any legal timing with no further restrictions. [57:21]
- If a face-down card would enter a private or secret zone, or if the game ends, it must be **revealed** to all players. [38:32]

### Legion [57:30]

- **Type:** Conditional keyword
- **Effect:** Becomes active if you have **played another main deck card** earlier in that turn. [57:32]

### Reaction [57:37]

- **Type:** Permissive keyword
- **Effect:** Allows playing a card or ability during **closed states** on **any player's turn**. [57:39]

### Shield [57:45]

- **Type:** Static ability (units)
- **Format:** Shield followed by a number. [57:47]
- **Effect:** When the unit is a **defender**, its might increases by the Shield value. [57:58]
- Additional sources of Shield are **added together**. [57:54]

### Tank [58:03]

- **Type:** Passive ability (units)
- **Effect:** The unit must be assigned **lethal damage** before any non-Tank unit controlled by the same player can receive combat damage. [58:05]
- If multiple Tanks exist, the opposing player chooses which to damage, but non-Tank units remain protected. [58:13]

### Vision [58:21]

- **Type:** Triggered ability (permanents)
- **Trigger:** "When you play this" [58:23]
- **Effect:** Look at the top card of your main deck. You may recycle it. [58:25]
- Multiple instances of Vision resolve **separately** (they do not stack into one action). [58:31]
- If you choose not to recycle on the first instance, subsequent instances will show you the same card. [58:38]

---

## 13. Game Actions Reference

### Discretionary Actions

Actions that a player can choose to take at any time during their turn in a neutral open state, as long as they meet costs and conditions. [35:15]

| Action | Description | Reference |
|--------|-------------|-----------|
| **Play a card** | Pay costs and place a card from hand (or other zone) onto the chain/board | [24:30] |
| **Standard Move** | Exhaust one or more units to move them (all must go to the same destination) | [08:20] |
| **Hide** | Pay to place a card face down at a controlled battlefield | [38:00] |
| **Activate an ability** | Pay the cost of an activated ability on a card you control | [33:42] |

### Limited Actions

Actions that can only be performed when instructed by game effects, rules, or turn progression. [35:36]

| Action | Description | Reference |
|--------|-------------|-----------|
| **Draw** | Take the top card of main deck and add to hand | [36:00] |
| **Exhaust** | Mark a non-spell game object as spent (turn it horizontal/90 degrees). Cannot exhaust an already-exhausted object. | [36:15] |
| **Ready** | Return an exhausted game object to its available (vertical) orientation | [37:01] |
| **Recycle** | Place one or more cards from any zone to the bottom of their corresponding deck. Multiple main deck cards are placed in **random order**; multiple runes can be placed in **chosen order**. | [37:01] |
| **Move** | Take a game object from one board location to another (limited action except via standard move) | [37:33] |
| **Discard** | Take a card from hand and place it in the trash. The discarding player chooses which card. | [38:42] |
| **Stun** | Select unit(s) and stun them. Stunned units do not contribute might in combat. | [38:51] |
| **Reveal** | Show a card from a private/secret zone to all players. Only when instructed by game effects. | [39:02] |
| **Counter** | Negate the execution of a card. The countered card loses its effects, is not considered "played," and goes to the trash. Costs paid are not refunded. | [39:57] |
| **Buff** | Place a buff counter on a unit. A unit can only have **one** buff counter. Buffing a buffed unit does nothing. The buff counter itself is a targetable object. | [40:16] |
| **Banish** | Place a card from any zone into banishment. Not a subset of killing or discarding. | [40:35] |
| **Kill** | A permanent goes from the board to the trash. Can be active (instructed by effect/cost) or passive (lethal damage/state consequence). Only counts as "kill" if the origin is a board zone. Not technically a "move." | [41:27] |
| **Add** | Put resources into a player's rune pool. Happens immediately, cannot be reacted to. If the add ability has Reaction, it can be used to pay for a card being played. | [41:59] |
| **Channel** | Take the top card of the rune deck and place it onto the board. | [42:18] |

---

## 14. Control & Relevance

### Battlefield Control [12:48]

- A battlefield is **controlled** by a player if they are the **only** player with units on it. [12:53]
- A battlefield can be **uncontrolled** (no units from anyone).
- A battlefield becomes **contested** when a unit controlled by a player who does not control the battlefield moves onto it. [13:02]
- While contested, the **actual control does not change** until combat resolves. [13:14]

### General Control [13:22]

In most other cases, control refers to the player in possession of a card or ability.

### Relevant Players [20:11]

A "relevant player" is one who is allowed to act during a chain or showdown:

- During a combat, the **attacking and defending players** are relevant. [20:44]
- If there is **no combat** (e.g., showdown at an empty battlefield), **all players** are relevant. [20:46]
- Relevance persists until the chain or showdown ends. [20:30]

**In larger games (3+ players):** If players A and B are in combat, player C cannot get involved -- they are not relevant. [20:53]

### Inviting Players [21:03]

- The active player can invite a non-relevant player into a chain or showdown (limited action).
- The invited player may **refuse**. [21:19]
- If they accept, they must be able to play a card or activate an effect at that timing. [21:24]
- Once accepted, the invited player remains relevant until the chain/showdown fully ends. [21:29]

---

## 15. Layers

Layers determine how multiple simultaneous effects interact. There are three layers, applied in order: [51:49]

### Layer 1: Trait-Altering Effects [52:09]

Granting, removing, or replacing inherent traits of a game object:
- Name, supertype, type, tags, controller, cost, domain.
- **Might assignment** (effects that say "a unit's might **becomes** X") -- not might modification. [52:28]
- One game object **becoming a copy** of another. [52:40]
- Identified by: "becomes," "gives," "is," or "are." [52:52]

### Layer 2: Ability-Altering Effects [53:03]

Granting, removing, or replacing abilities/rules text:
- Keywords, passive abilities, appending/removing rules text, duplicating rules text. [53:11]
- Identified by: "becomes," "gives," "loses," "have," "has," "is," or "are." [53:23]

### Layer 3: Arithmetic [53:33]

Increasing or decreasing numerical values:
- Might, energy costs, power costs. [53:40]

### Conflict Resolution [53:44]

If multiple effects apply in the **same layer**, both apply. Order is determined by:

1. **Dependency** -- one effect alters the existence, scope, or outcome of another. [53:54]
2. If no dependency exists, effects apply in **order of play** (oldest first, newest last). [54:18]

---

## 16. Game Modes

### 1v1 Duel [47:58]

- **Players:** 2
- **Points to win:** 8
- **Battlefields:** Each player provides 3; one randomly selected per player (2 total in play).
- **First round:** Player going second channels **one extra rune** (starts with 3 runes; first player starts with 2). [48:20]

### 1v1 Match [48:29]

- **Players:** 2
- **Format:** Best of three duels; each duel win = 1 match point.
- **Battlefields:** Same as duel, but in round 2, you cannot reuse the battlefield from round 1 (choose randomly from remaining 2). In round 3, use the final remaining battlefield. [48:42]
- All other rules same as duel.

### Skirmish (3-Player FFA) [49:01]

- **Players:** 3
- **Battlefields:** Each player provides 3; one randomly selected per player (3 total in play).
- **First round differences:** [49:09]
  - Player 1: **Does not draw** on their first turn.
  - Player 2: Plays normally (draws a card, channels 2 runes).
  - Player 3: Gets the **extra rune** (channels 3 on first turn).

### War (4-Player FFA) [49:26]

- **Players:** 4
- **Battlefields:** Each player provides one randomly chosen battlefield, but **Player 1's battlefield is removed** from the game. Only 3 battlefields are used. [49:35]
- **First round differences:**
  - Player 1: Does not draw. [49:43]
  - Players 2 and 3: Play normally.
  - Player 4: Gets extra starting runes. [49:48]

### Magma Chamber (2v2) [49:53]

- **Players:** 4 (two teams of 2)
- **Points to win:** 11
- **Battlefields:** 3 battlefields, selected the same way as War (Player 1's battlefield removed). [49:58]
- **First round:** Same as War (Player 1 no draw, Player 4 extra rune). [50:02]
- **Turn order:** Alternates between teams (A, B, A, B, then loops). [50:12]
- **Unique rules:** [50:19]
  - Players can cast spells during their **teammate's turn**. [50:22]
  - You only score hold points from battlefields **you** control (not your partner's). [50:26]
  - Control is **not shared** between teammates. [50:32]
  - Cannot hide cards at a teammate's controlled battlefield. [50:33]
  - Cannot typically move a teammate's units. [50:37]
  - Cards targeting "friendly units" **can** target teammate's cards. [50:42]
  - Hand remains **private** even from teammates (you can say anything verbally but cannot show cards). [50:46]
  - **Final point by conquering:** Must score each battlefield in the same turn, **except** battlefields occupied by your teammate at the turn's beginning phase. [50:55]

---

## 17. Conceding

Players can concede at any time. [51:12]

When a player concedes:
1. They are removed from the game. [51:18]
2. If only one player remains, that player wins. [51:20]
3. The conceding player:
   - Removes themselves from any showdowns. [51:26]
   - **Banishes** all their permanents and runes. [51:28]
   - Their battlefield is removed from the game. [51:33]
   - If the battlefield was in use, it is replaced by a **token with no abilities**. [51:37]
   - Hidden cards at the removed battlefield are **not** transferred to the token. [51:42]
4. Game proceeds as normal. [51:46]

---

## Appendix: Common Mistakes & Confusing Interactions

These are points where the video specifically calls out potential confusion:

1. **Champion vs. Signature units:** A signature unit sharing a tag with your legend is NOT a valid chosen champion. Only champion units qualify. [01:44]

2. **Card name uniqueness:** "Jinx Demolitionist" and "Jinx Rebel" are different cards for the 3-copy limit. The full name matters. [06:12]

3. **Runes are not permanents:** Despite staying on the field, runes are not permanents because they don't come from the main deck. [10:24]

4. **Rune pool empties twice per turn:** Once at the end of the draw phase, and once at the end of the turn. [10:57, 19:13]

5. **Double-dipping runes:** You can exhaust a rune for energy and then recycle the same exhausted rune for power. Costs can be paid in any order. [28:09]

6. **Burn out loop in multiplayer:** If both deck and trash are empty, burn out repeats, letting you choose which opponent gets points (potentially deciding who wins). [18:05]

7. **Chain vs. Stack terminology:** Riftbound's chain is LIFO like MTG's stack, not like Yu-Gi-Oh's chain. [23:20]

8. **Card identity after zone change:** A card that leaves the board (e.g., bounced to hand) and returns is not the same game object, even if it's the same physical card. [29:35]

9. **Targeting on permanents vs. spells:** Permanent triggered abilities like "when I am played, kill a unit" don't choose targets until the permanent resolves. Spells choose targets when played. [24:52]

10. **"Ignore cost" vs. "Ignore energy/power cost":** These are different. "Ignore cost" zeros everything; "Ignore energy cost" only zeros the energy component. Additional costs (like Accelerate) are never ignored by these effects. [26:54]

11. **Revealing vs. showing:** Voluntarily showing a card from your hand is NOT "revealing" for game purposes. Only effects that say "reveal" count as revealing (which could trigger other effects). You cannot voluntarily show secret information (like the top of your deck). [39:25]
