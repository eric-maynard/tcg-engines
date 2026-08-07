/**
 * Lilting Lullaby — unl-190-219 · Spell · Calm/Mind · 2 energy + [rainbow][rainbow] (calm|mind hybrid pips)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter a spell. Its controller can't play spells this turn.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. Counter (425): the target does nothing, is cleared to the trash, and its costs are NOT refunded.
 *     Any spell qualifies (no cost cap, unlike Defy) — but never Lullaby itself (355.9.c), never a
 *     triggered/activated ability, and with no spell on the chain it cannot be played at all (355.8).
 *  2. "Its controller" is whoever controlled the countered spell: normally the opponent, but if you
 *     Lullaby your OWN spell you silence yourself.
 *  3. The lock is on PLAYING SPELLS only, for the rest of THIS turn: units/gear are still playable,
 *     Reactions and Hidden spells from facedown are also spells (blocked), and next turn it is gone.
 *  4. Timing of the lock: it lands when Lullaby RESOLVES — the victim may still respond to Lullaby
 *     with another spell while it sits on the chain.
 *  5. Linked instruction (359.3.e.14.a): if the targeted spell is already gone when Lullaby resolves
 *     (countered by a Wind Wall stacked above it), nothing is countered AND nobody is silenced.
 *  6. Cost: 2 energy + two hybrid pips payable with calm and/or mind power; one pip short → illegal.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-190-219";
const WIND_WALL = "ogn-064-298"; // Calm Reaction 3 + [calm][calm]: Counter a spell.
const CONSULT_THE_PAST = "ogn-083-298"; // Hidden Reaction spell: Draw 2.
const bolt = (name: string, energyCost = 1) =>
  ({
    abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost,
    name,
    timing: "action",
  }) as const;
const QUICK_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Quick Draw",
  timing: "reaction",
} as const;
const GRUNT = { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" } as const;

/** P2's turn. P2 (6 energy) holds two Bolts, a 0-cost Reaction and a unit; P1 holds Lullaby with `p1` resources and a 5-might Wall. */
function duel(p1: { energy: number; power: Record<string, number> } = { energy: 2, power: { calm: 1, mind: 1 } }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6 })
    .resources(P1, p1)
    .unit(P1, "base", { might: 5, name: "Wall" }, "wall")
    .hand(P2, bolt("Big Bolt", 5), "bolt")
    .hand(P2, bolt("Spare Bolt"), "bolt2")
    .hand(P2, QUICK_DRAW, "quick")
    .hand(P2, GRUNT, "grunt")
    .hand(P1, CARD, "lull");
}

/** P2 opens with Big Bolt on the Wall and passes; P1 answers with Lullaby on it. */
async function lullabyTheBolt(game: Game): Promise<void> {
  await game.p2.cast("bolt", { targets: "wall" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  await game.p1.cast("lull", { targets: "bolt" });
}

describe("Lilting Lullaby (unl-190-219)", () => {
  test("registry payload: Calm/Mind Reaction, 2 energy + 2 hybrid pips, a single counter effect that also restricts the victim's spell plays", async () => {
    await duel().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["calm", "mind"], energyCost: 2, powerCost: ["rainbow", "rainbow"], timing: "reaction" });
    expect(def?.abilities).toEqual([{ effect: { restrictsSpellPlays: true, type: "counter" }, timing: "reaction", type: "spell" }]);
  });

  test("counter (425.1): pays 2 energy + both pips; the 5-cost Bolt is countered — no damage, both spells in trash, P2's 5 energy NOT refunded", async () => {
    const game = await duel().build();
    await lullabyTheBolt(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "lull"]);
    await game.settle();
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.p2.energy()).toBe(1); // 6 − 5, nothing back (425.1.c)
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("cost: the two hybrid pips take calm and/or mind (2 calm works, calm+mind works); 1 pip, off-domain power, or 1 energy → not castable", async () => {
    for (const [pool, ok] of [
      [{ energy: 2, power: { calm: 2 } }, true],
      [{ energy: 2, power: { calm: 1, mind: 1 } }, true],
      [{ energy: 2, power: { mind: 1 } }, false],
      [{ energy: 2, power: { fury: 2 } }, false],
      [{ energy: 1, power: { calm: 1, mind: 1 } }, false],
    ] as const) {
      const game = await duel(pool).build();
      await game.p2.cast("bolt", { targets: "wall" });
      await game.p2.passPriority();
      expect(game.p1.can("cast", "lull")).toBe(ok);
    }
  });

  test("'its controller can't play spells this turn': after resolution P2 cannot cast the Spare Bolt nor even a 0-cost Reaction, but CAN still play a unit", async () => {
    const game = await duel().build();
    await lullabyTheBolt(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.can("cast", "bolt2")).toBe(false);
    expect(game.p2.can("cast", "quick")).toBe(false);
    expect(game.p2.can("play", "grunt")).toBe(true);
    await game.p2.play("grunt");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.p1.can("cast", "lull")).toBe(false); // (gone — sanity)
  });

  test("'this turn' only — on P2's NEXT turn (with fresh energy) spells must be legal again", async () => {
    // Expected: the silence expires with the turn. Actual: `cannotPlaySpellsThisTurn` is never cleared
    // (and the stored turn number is not compared), so P2 can never cast a spell again.
    const game = await duel().build();
    await lullabyTheBolt(game);
    await game.settle();
    expect(game.p2.can("cast", "bolt2")).toBe(false);
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "bolt2")).toBe(true);
  });

  test("the lock lands on RESOLUTION: while Lullaby is still on the chain P2 may respond with Quick Draw (it resolves and draws); afterwards P2 is silenced", async () => {
    const game = await duel().deck(P2, ["ogn-175-298"], ["p2top"]).build();
    await lullabyTheBolt(game);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "quick")).toBe(true);
    await game.p2.cast("quick");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "lull", "quick"]);
    await game.settle();
    expect(game.zoneOf("p2top")).toBe("hand"); // Quick Draw resolved normally
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p2.can("cast", "bolt2")).toBe(false);
  });

  test("needs a spell to target: not castable in an open state, cannot target itself (355.9.c), and a unit being played is not a spell", async () => {
    const game = await duel().build();
    expect(game.p1.can("cast", "lull")).toBe(false); // nothing on the chain
    await game.p2.play("grunt");
    // Whether or not the unit play opens a window for P1, Lullaby has no SPELL to counter.
    expect(game.p1.can("cast", "lull")).toBe(false);
    await game.settle();
    await game.p2.cast("bolt", { targets: "wall" });
    await game.p2.passPriority();
    const targets = game.p1.option("cast", "lull")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["bolt"]]); // only the Bolt — never "lull" itself
  });

  test("two spells on the chain: P1 picks which to counter — countering the Quick Draw leaves the Bolt to resolve (Wall takes 2) and still silences P2", async () => {
    const game = await duel().build();
    await game.p2.cast("bolt", { targets: "wall" });
    await game.p2.cast("quick"); // P2 keeps priority after its own spell and stacks a Reaction
    await game.p2.passPriority();
    const targets = game.p1.option("cast", "lull")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["bolt"], ["quick"]]));
    const handBefore = game.p2.hand().length;
    await game.p1.cast("lull", { targets: "quick" });
    await game.settle();
    expect(game.zoneOf("quick")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore); // countered: no draw
    expect(game.state("wall").damage).toBe(2); // the Bolt was not the target and resolved
    expect(game.p2.can("cast", "bolt2")).toBe(false);
  });

  test("'its controller' can be YOU: Lullaby on your own spell counters it and silences yourself (P2 unaffected)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P2, "base", { might: 5, name: "Their Wall" }, "twall")
      .hand(P1, bolt("My Bolt"), "mine")
      .hand(P1, bolt("My Spare"), "spare")
      .hand(P1, CARD, "lull")
      .build();
    await game.p1.cast("mine", { targets: "twall" });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("lull", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.state("twall").damage).toBe(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "spare")).toBe(false);
    expect(Object.keys(game.gameState.cannotPlaySpellsThisTurn ?? {})).toEqual([P1]);
  });

  test("Hidden spells are spells too (811.1.b 'you may play this') — a silenced P2 cannot play Consult the Past from facedown this turn (it could before Lullaby resolved)", async () => {
    const game = await duel()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
      .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
      .build();
    await game.p2.cast("bolt", { targets: "wall" });
    expect(game.p2.can("reveal", "ctp")).toBe(true); // closed state, hidden since an earlier turn → playable for 0
    await game.p2.passPriority();
    await game.p1.cast("lull", { targets: "bolt" });
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("facedown-bf2");
    // Open a new closed state on P2's turn so a Reaction would otherwise be legal.
    await game.p2.play("grunt", { to: "base" });
    expect(game.p2.can("reveal", "ctp")).toBe(false);
    await game.settle();
    expect(game.p2.can("reveal", "ctp")).toBe(false);
  });

  test("linked (359.3.e.14.a): if the Bolt is already countered by a Wind Wall stacked above Lullaby, Lullaby counters nothing and P2 is NOT silenced", async () => {
    const game = await duel({ energy: 5, power: { calm: 4 } }).hand(P1, WIND_WALL, "ww").build();
    await lullabyTheBolt(game);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("ww", { targets: "bolt" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "lull", "ww"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p2.can("cast", "bolt2")).toBe(true); // 1 energy left, and no restriction landed
    expect(game.gameState.cannotPlaySpellsThisTurn?.[P2]).toBeUndefined();
  });

  test("negative space: countering P2's spell never restricts P1 — P1 can still cast a second Reaction later this turn", async () => {
    const game = await duel({ energy: 5, power: { calm: 4 } }).hand(P1, WIND_WALL, "ww").build();
    await lullabyTheBolt(game);
    await game.settle();
    expect(game.p2.can("cast", "bolt2")).toBe(false);
    // P2 plays a unit (allowed); if that opens a chain, P1's Wind Wall has no spell to target, but the
    // restriction map must name only P2.
    expect(game.gameState.cannotPlaySpellsThisTurn ?? {}).toEqual({ [P2]: expect.any(Number) });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });
});
