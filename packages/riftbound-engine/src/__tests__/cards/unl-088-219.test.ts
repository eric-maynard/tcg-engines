/**
 * Gutter Palace — unl-088-219 · Gear · Mind · 4 energy
 *
 *   At the start of your Beginning Phase, if you have exactly 4 cards in hand and exactly 4 units at
 *   battlefields, you win the game.
 *   Discard 1, [Exhaust]: Play a 1 [Might] Bird unit token with [Deflect]. (Opponents must pay
 *   [rainbow] to choose it with a spell or ability.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "At the start of your Beginning Phase" is BEFORE the Channel and Draw steps and before Hold
 *      scoring (315): the hand is counted as it was when the opponent ended their turn — 3 cards that
 *      become 4 in the Draw step are too late. Only YOUR Beginning Phase counts.
 *   2. "if you have exactly …" sits immediately after the trigger condition, so it is PART of the
 *      condition (383.2.a.1): with 3 or 5 cards / 3 or 5 units nothing goes on the chain at all; and
 *      once it HAS triggered, the numbers are not re-checked on resolution — killing one of the four
 *      units in response does not stop the win (383.2.a.1, Sona example).
 *   3. "units at battlefields": units you CONTROL, summed across all battlefields; units in your
 *      base and enemy units never count. Exactly 4 — 5 is as bad as 3.
 *   4. Activated ability: TWO costs paid on activation — discard 1 (a real discard: hand → trash) and
 *      exhaust this. Empty hand or an exhausted Palace → not activatable. No [Action]/[Reaction] on
 *      the ability → your Main Phase open state only (151.2), never in a showdown or on their turn.
 *   5. The Bird is PLAYED (185.2.a): a 1-Might token unit with Deflect and the Bird tag, entering
 *      exhausted, to your base or a battlefield you control (never the enemy's), owned/controlled by you.
 *   6. Cost to play the Palace itself: 4 energy.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-088-219";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit used as hand padding
const BOLT2 = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "reaction",
} as const;

/** P2 is about to end turn 3. P1 has the Palace, `hand` cards, `atBf` units spread over bf1/bf2 (both P1's) and `inBase` units in base. */
function eve(hand: number, atBf: number, inBase = 0) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .gear(P1, CARD, "palace");
  for (let i = 0; i < atBf; i++) {
    b.unit(P1, i % 2 ? "bf1" : "bf2", { might: 2, name: `Unit ${i}` }, `u${i}`);
  }
  for (let i = 0; i < inBase; i++) {
    b.unit(P1, "base", { might: 2, name: `Home ${i}` }, `h${i}`);
  }
  for (let i = 0; i < hand; i++) {
    b.hand(P1, FILLER, `c${i}`);
  }
  return b;
}

/** P1's main phase: Palace + 2 cards in hand, one unit on P1's bf1, P2 holds bf2. */
function day() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, FILLER, "f1")
    .hand(P1, FILLER, "f2")
    .gear(P1, CARD, "palace");
}

describe("Gutter Palace (unl-088-219)", () => {
  test("registry payload: a beginning-phase win trigger gated on exactly-4-in-hand AND exactly-4-units-at-battlefields, plus a discard-1+exhaust activated Bird-token maker", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 4 });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: {
        conditions: [
          { count: 4, target: { controller: "friendly", location: "hand" }, type: "has-exactly" },
          { count: 4, target: { controller: "friendly", location: "battlefield", type: "unit" }, type: "has-exactly" },
        ],
        type: "and",
      },
      effect: { type: "win-game" },
      trigger: { event: "beginning-phase", on: "controller" },
      type: "triggered",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      cost: { discard: 1, exhaust: true },
      effect: { token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" },
      type: "activated",
    });
  });

  test("playing the Palace: 4 energy to base, ready; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "palace").build();
    await game.p1.play("palace");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("palace")).toBe("base");
    expect(game.state("palace").isReady).toBe(true);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "palace").build()).p1.can("play", "palace")).toBe(false);
  });

  test("exactly 4 in hand + exactly 4 units at battlefields when YOUR Beginning Phase starts → the trigger resolves and you WIN THE GAME", async () => {
    // Expected: P2 ends turn → Palace trigger on the chain in P1's Beginning Phase → both pass → P1 wins.
    // Actual: the trigger is created but the `win-game` effect is not implemented; play continues to main phase.
    const game = await eve(4, 4).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "palace", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(4); // counted before the draw step
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the 'if' is part of the trigger condition (383.2.a.1) — killing one of the four units IN RESPONSE does not stop the win", async () => {
    // Expected: condition true when the Beginning Phase starts → ability triggers; P2 bolts u1 in response
    // (now 3 units) → bolt resolves, then the Palace ability resolves WITHOUT re-checking → P1 wins.
    // Actual: no win-game effect exists.
    const game = await eve(4, 4).runes(P2, "fury", 1).hand(P2, BOLT2, "bolt").build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.tapRune();
    await game.p2.cast("bolt", { targets: "u1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["palace", "bolt"]);
    await game.settle();
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("negative space — hand size: 3 cards (drawing to 4 in the Draw step is too late) or 5 cards → no win, normal main phase", async () => {
    const three = await eve(3, 4).build();
    await three.advanceTurn();
    expect(three.turnPlayer()).toBe(P1);
    expect(three.isOver()).toBe(false);
    expect(three.p1.hand()).toHaveLength(4); // 3 + draw step: still no win
    const five = await eve(5, 4).build();
    await five.advanceTurn();
    expect(five.isOver()).toBe(false);
    expect(five.phase()).toBe("main");
  });

  test("negative space — units: 3 at battlefields + 1 in base, or 5 at battlefields, or 3 of yours + 1 ENEMY unit at a battlefield → no win", async () => {
    const withBase = await eve(4, 3, 1).build();
    await withBase.advanceTurn();
    expect(withBase.isOver()).toBe(false);
    const five = await eve(4, 5).build();
    await five.advanceTurn();
    expect(five.isOver()).toBe(false);
    const enemy = await eve(4, 3).unit(P2, "bf3", { might: 2, name: "Intruder" }, "intruder").build();
    await enemy.advanceTurn();
    expect(enemy.isOver()).toBe(false);
    expect(enemy.turnPlayer()).toBe(P1);
  });

  test("with the condition false (3 cards in hand) the ability must not be put on the chain at all (383.2.a.1)", async () => {
    // Expected: an intervening "if" that is false when the Beginning Phase starts → nothing triggers.
    // Actual: the Palace trigger is placed on the chain unconditionally (the has-exactly condition is never evaluated).
    const game = await eve(3, 4).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  test("only YOUR Beginning Phase: 4/4 while the OPPONENT's turn begins does nothing", async () => {
    const b = scenario().turn(2).active(P1).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P1 }).gear(P1, CARD, "palace");
    for (let i = 0; i < 4; i++) {
      b.unit(P1, i % 2 ? "bf1" : "bf2", { might: 2 }, `u${i}`).hand(P1, FILLER, `c${i}`);
    }
    const game = await b.build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
  });

  test("activated: 'Discard 1, [Exhaust]' are both paid on activation (card → trash, Palace exhausted), the ability goes on the chain, and a Bird token is then PLAYED to a location you control", async () => {
    const game = await day().build();
    expect(game.p1.option("activate", "palace")?.fields.find((f) => f.arg === "discard")?.options).toEqual(["f1", "f2"]);
    await game.p1.activate("palace", undefined, { discard: "f1" });
    expect(game.zoneOf("f1")).toBe("trash");
    expect(game.p1.hand()).toEqual(["f2"]);
    expect(game.state("palace").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "palace", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]); // never the enemy's bf2
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const bird = game.p1.units("bf1").find((id) => game.state(id).name === "Bird") as string;
    expect(bird).toBeDefined();
    expect(game.state(bird)).toMatchObject({ cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, owner: P1 });
    expect(game.state(bird).keywords).toContain("Deflect");
    expect(game.state(bird).domains).toEqual([]);
    expect(game.p2.units()).toEqual(["theirs"]);
  });

  test("activated — cost edge cases: empty hand → not activatable; already exhausted → not activatable; nothing is discarded on a failed attempt", async () => {
    const empty = await scenario().gear(P1, CARD, "palace").build();
    expect(empty.p1.can("activate", "palace")).toBe(false);
    const tapped = await scenario().hand(P1, FILLER, "f1").gear(P1, CARD, "palace", { exhausted: true }).build();
    expect(tapped.p1.can("activate", "palace")).toBe(false);
    expect(tapped.zoneOf("f1")).toBe("hand");
    // Once per ready-cycle: after one use it is exhausted and the second card cannot be discarded to it this turn.
    const game = await day().build();
    await game.p1.activate("palace", undefined, { discard: "f1", answers: ["base"] });
    await game.settle();
    expect(game.p1.can("activate", "palace")).toBe(false);
    expect(game.zoneOf("f2")).toBe("hand");
  });

  test("activated — timing (151.2, no [Action]/[Reaction]): not on the opponent's turn and not inside a showdown", async () => {
    const opp = await day().active(P2).build();
    expect(opp.p1.can("activate", "palace")).toBe(false);
    const sd = await day().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "palace")).toBe(false);
  });

  test("the minted Bird is Deflect-taxed for opponents (809): next turn P2 needs a power on top of the bolt's energy to target it", async () => {
    const game = await day().hand(P2, BOLT2, "bolt").build();
    await game.p1.activate("palace", undefined, { discard: "f1", answers: ["base"] });
    await game.settle();
    const bird = game.p1.units("base").find((id) => game.state(id).name === "Bird") as string;
    expect(bird).toBeDefined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    expect((await game.p2.try((p) => p.cast("bolt", { targets: bird }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { fury: 1 } });
    await game.p2.cast("bolt", { targets: bird });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.has(bird) && game.locationOf(bird) === "base").toBe(false);
  });
});
