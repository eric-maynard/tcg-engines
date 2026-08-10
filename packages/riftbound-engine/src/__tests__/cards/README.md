# Card tests — guide for the expert unit-test writer

One file per card: `src/__tests__/cards/<card-id>.test.ts` (e.g. `ogn-004-298.test.ts`).
One `test()` per rules clause / sentence of the card text (plus one per relevant timing or
targeting restriction). Use ONLY the harness API (`../../harness`) — no `internalState`
casts, no raw `engine.executeMove`, no hand-rolled end-turn code. See the three exemplars in
this directory and `docs/harness/HARNESS-DESIGN.md`.

```ts
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-004-298"; // put the id in a const named after the card

describe("Cleave (ogn-004-298)", () => {
  test("gives a unit Assault 3 this turn", async () => {
    const game = await scenario()                       // turn 2, main phase, P1 active, empty pools
      .resources(P1, { energy: 1 })                     // what the card costs
      .unit(P1, "base", { might: 2 }, "ally")           // inline vanilla unit, alias "ally"
      .hand(P1, CARD, "cleave")                         // the card under test, alias "cleave"
      .build();
    await game.p1.cast("cleave", { targets: "ally" }); // ONE call = the whole play bundle
    await game.settle();                                // everyone passes → it resolves
    expect(game.state("ally").grantedKeywords).toEqual([{ keyword: "Assault", value: 3, duration: "turn" }]);
    expect(game.zoneOf("cleave")).toBe("trash");
  });
});
```

Start the file with a doc comment quoting the card's full rules text, type, domains and cost.

## BUG policy

If a clause is not implemented or behaves against the rules, still write the assertion the
rules demand, inside `test.failing("BUG: <what the rules say should happen> (rule refs)", …)`.
Add a 2–3 line comment stating expected vs actual. Never weaken an assertion to make it pass,
never `test.skip`. When the engine is fixed the `test.failing` starts failing and gets flipped.

## Building the position — `scenario()`

| Call | Effect |
|---|---|
| `scenario({ seed?, players?: 2\|3\|4 })` | new builder; defaults: turn 2, phase `main`, P1 active, pools empty, decks auto-filled |
| `.turn(n) .phase("main") .active(P2)` | position; `active` is whose turn it is |
| `.resources(P1, { energy, power: { fury: 1, rainbow: 1 } })` | rune pool. A `[rainbow]` cost pip is paid from `power.rainbow` (engine quirk) |
| `.points(P1, 7) .xp(P1, 3) .victoryScore(8)` | scoring state |
| `.battlefield("bf1", { controller: P2 \| null, def?: "ogn-294-298", inert?: true })` | declare a battlefield (inert = abilities stripped, default). Must precede placing units there. `controller` seeds control but places nothing: with no unit of that player on it, control LAPSES at the first Open-State Cleanup (rule 323.6 — usually your first move); put a unit/token there for durable control |
| `.hand(P1, defOrInline, alias?)` `.base(…)` `.trash(…)` `.banishment(…)` `.deckTop(…)` | put a card in that zone |
| `.unit(P2, "bf1" \| "base", "ogn-175-298" \| { might: 3, keywords: ["Tank"], name? }, alias?, meta?)` | a unit on the board; inline defs default to `cardType: "unit"` |
| `.gear(P1, def, alias?)` `.legend(P1, def, alias?)` `.champion(P1, def, alias?)` | other permanents / zones |
| `.rune(P1, "fury", { alias?, exhausted? })` `.runes(P1, "fury", 3)` | channeled runes in the rune pool (tap them with `tapRune`) |
| `.facedown(P1, "bf1", def, alias?)` | a hidden card at a battlefield |
| `.deck(P1, [defs…], [aliases…])` `.runeDeck(P1, [defs…])` `.fillDecks({ main, runes } \| false)` | deck contents, top first; filler keeps turn advances from burning out |
| `meta` argument | `{ damage: 2, exhausted: true, buffed: true, stunned: true, mightModifier: 1, … }` |
| `.script(P2, ["decline", "pass", "someAlias", (d) => …], { strict: true })` | queued answers for that seat's prompts (see below) |
| `.autoProcedures(false)` | surface `resolveFullCombat`/`endShowdown` as options instead of auto-running them |
| `await ….build()` | → `Game` |

Aliases become the card's id everywhere (`"ally"`, `"cleave"`). Enemy units are just
`.unit(P2, …)`. Use real ids for the card under test and for anything whose printed text matters;
use inline `{ might: n }` vanilla units for everything else so the test states its assumptions.
Vanilla real cards if you need them: `ogn-175-298` Shipyard Skulker (3-might unit).

## Acting — `game.p1` / `game.p2` (a `SeatHandle`)

All actions are `async` and THROW a `HarnessError` (with the reason and the seat's legal menu)
when illegal — so an unexpected illegality fails the test at that line.

| Verb | Meaning / engine move |
|---|---|
| `play(card, { to?: "base"\|"bf1", accelerate?: true, payOptional?, sacrifice?, targets?, x?, repeat? })` | play a unit/gear from hand (`playUnit`/`playGear`; spells are forwarded to `cast`) |
| `cast(card, { targets?: "x" \| ["a","b"], mode?, modes?, x?, repeat?, flow?, payOptional? })` | play a spell (`playSpell`); `targets` order = card text order (e.g. `[friendly, enemy]`, two roles `[target1, target2]`); `mode` = printed bullet index of a "Choose one —" spell (rule 355.3), `modes` = one per [Repeat] execution |
| `activate(card, abilityIndex = 0, { sacrifice?, discard?, answers? })` | activated ability (legend, gear, unit). Targets are asked on resolution → answer them (below) |
| `move(unit \| [units], "bf1" \| "base")` `gank(unit, "bf2")` | standard move (multi-unit OK) / ganking move |
| `hide(card, "bf1")` `reveal(card)` `playChampion("base")` | hidden cards / champion |
| `tapRune(rune? \| { domain })` `tapRunes(n)` `recycleRune(rune, domain?)` | rune → 1 energy / rune → 1 power |
| `passPriority()` `passFocus()` `pass()` | pass on a chain / in a showdown / whichever applies |
| `endTurn()` | end this seat's turn (next player's start-of-turn triggers may then be pending) |
| `game.advanceTurn()` | `endTurn()` for the turn player **and** settle into the next player's open main phase |
| `game.advanceToTurnOf(P1)` | repeat until it is P1's main phase |
| `concede()` | forfeit |
| `answer(v)` `pick("a")` `decline()` `yes()` `no()` `chooseX(3)` `chooseMode(1)` `name("Cleave")` `distribute({a:1})` | answer the current prompt (AnswerPopup) |
| `choose(optionKey, args)` `do(moveId, params)` | generic option / raw engine move (escape hatches; `do("addResources", {energy: 1})`, `do("drawCard", {count: 1})`) |
| `try(p => p.cast(…))` | `{ ok:false, error }` instead of throwing — for "this must be illegal" tests |

`await game.settle()` drains everything that is not an open main-phase decision: passes
priority/focus for both players, auto-runs combat resolution, takes forced single-option picks,
and consumes scripted answers. It stops (`reason: "unanswered"`) at a real prompt nobody
scripted — then answer it explicitly (`game.p1.pick("x")`) and continue.

If a verb needs a choice you did not give, it throws `AMBIGUOUS_ACTION` naming the missing
argument and the legal values (e.g. ``cast(cleave): needs `targets` — one of: ally | foe``).
One default applies: a unit play offered at several destinations (base plus battlefields a
permission opens — every cost line is offered at each of them, rule 355.2.a) goes to the BASE
when no `to` is given; name `to: "bf1"` for anything else.

## Expressing each kind of decision

| Situation | How |
|---|---|
| Spell/ability target chosen when played | `cast(card, { targets: "foe" })`, two roles: `{ targets: ["mine", "theirs"] }` |
| Modal spell ("Choose one —"), rule 355.3 | `cast(card, { mode: 1, targets: "foe" })` names mode + its target on the play (nothing is asked); a bare `cast(card)` is asked at once, before priority: `chooseMode(1)` then `pick("foe")` (both `timing:"FIN"`, mode options carry printed `label`s), THEN `settle()`. Illegal modes (355.8) are absent from `option("cast",c).fields` `mode.options`/`labels`; a forced single mode is locked without asking. [Repeat]: `cast(card, { repeat: 1, modes: [1, 0], targets: ["foe"] })`. The chain view shows `{ mode, targets }`. |
| X (Bullet Time) | `cast(card, { x: 3 })` |
| Repeat / Accelerate / optional extra cost | `{ repeat: 2 }` / `play(card, { accelerate: true })` / `{ payOptional: true }`, kill-a-unit costs: `{ sacrifice: "ally" }` |
| Where a unit is played / moved | `play(card, { to: "bf1" })`, `move(["a","b"], "bf1")` |
| Prompt after resolution (choose target of a trigger, reveal-and-pick, weaponmaster, destination) | `await game.settle();` then `await game.p1.pick("alias")` / `.decline()`; or pre-queue: `play(card, { answers: ["alias"] })` / `.script(P1, ["alias"])` |
| "You may" trigger | `await game.p1.yes()` / `.no()` |
| Name a card | `await game.p1.name("Cleave")` |
| Opponent must choose (e.g. owner picks top/bottom) | it becomes P2's decision: `expect(game.actingSeat()).toBe(P2); await game.p2.answer("mainDeck-bottom")` |
| Inspect what is being asked | `game.decision()` → `{ kind: "pick"\|"yes-no"\|"integer"\|"name"\|"action", seat, prompt, options… }` |
| Is something legal right now? | `game.p1.can("cast", "cleave")`, `game.p1.legal()` (labels), `game.p1.option("cast","cleave")?.fields` (legal targets etc.) |

## Asserting

| Read | Returns |
|---|---|
| `game.zoneOf(card)` | `"hand" \| "base" \| "trash" \| "banishment" \| "chain" \| "battlefield-bf1" \| "facedown-bf1" \| "mainDeck" …`; `"gone"` for a token that left the board (186.1 — it ceased to exist; `game.has(card)` is false) |
| `game.locationOf(card)` | `"base" \| "bf1" \| undefined` |
| `game.state(card)` | `CardState`: `damage, might (effective), baseMight, isExhausted/isTapped/isReady, isStunned, isBuffed, isHidden, isEmpowered, keywords[], grantedKeywords[], attachments[], attachedTo, owner, controller, zone, energyCost, meta (raw)` |
| `game.p1.hand() / base() / trash() / deck() / runes({ready?}) / units("bf1") / gear() / legend() / champion()` | card ids |
| `game.p1.energy() / power("fury") / resources() / points() / xp()` | numbers |
| `game.turnPlayer() / turnNumber() / phase() / actingSeat() / isOver() / winner()` | turn state |
| `game.chain()` | items on the chain `{ cardId, name, controller, triggered }[]` |
| `game.trace().expiration` | the last Ending Phase's Expiration Step passes (rule 317.2): `{ pass, steps:["heal","expire","empty-pools"], healed[], expired["mightModifier:ally",…], events["become-mighty:ally"], poolsEmptied{seat:{energy,power}}, itemsProcessed }[]` — 2+ entries mean 317.2.f re-looped |
| `game.gameState` | the raw public `RiftboundGameState` (battlefields[bf].controller, contested, …) |
| `game.violations()` | invariant violations recorded so far — `expect(game.violations()).toEqual([])` is a free extra oracle |

## Turn advancement recipes

- Effect lasts "this turn": act, `await game.advanceTurn()`, assert it is gone.
- "At the start of your Beginning Phase…": build with `.turn(2).active(P2)` and the card under P1,
  then `await game.advanceTurn()` (P2 ends → P1's turn starts, trigger settles) — or step manually:
  `await game.p2.endTurn(); expect(game.phase()).toBe("beginning"); …; await game.settle()`.
- Across a turn start the turn player channels 2 runes and draws 1 (decks are auto-filled).
- Combat: `move()` into an enemy-occupied battlefield opens a showdown (attacker has Focus);
  `settle()` passes focus for both and resolves combat; then assert zones/damage/controller/points.
