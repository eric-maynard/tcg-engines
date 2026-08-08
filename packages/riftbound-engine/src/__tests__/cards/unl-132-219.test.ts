/**
 * Angler Beast — unl-132-219 · Unit · Chaos · 5 energy + [chaos] · 5 Might
 *
 *   When you play me, return all units with 2 [Might] or less to their owners' hands.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "all units": BOTH players' units, in bases AND at every battlefield; the Beast itself (5) and
 *      anything at 3+ stays. It is not "choose", so it does not target — an enemy Deflect unit
 *      (Bird token, 1 Might) is swept up with no [rainbow] paid (809 only taxes choosing).
 *   2. "2 [Might] or less" reads CURRENT Might (buffs / +Might modifiers count, damage does not
 *      lower Might): a buffed printed-2 unit is 3 and stays; a damaged 3-Might unit stays.
 *   3. "their OWNERS' hands" (108.2): a unit you control but the opponent owns goes to the
 *      opponent's hand; a token returned to hand ceases to exist (186.1).
 *   4. It is a triggered ability on the chain: the opponent may React first — Feral Strength
 *      (+2 this turn) on their 2-Might unit lifts it to 4 before resolution and saves it.
 *   5. Empty case: no unit at 2 or less anywhere → the trigger resolves doing nothing.
 *   6. Facedown cards at a battlefield are not units on the board and are untouched.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-132-219";
const BIRD = "unl-t02"; // 1-Might unit token with Deflect
const FERAL_STRENGTH = "sfd-034-221"; // [Reaction] 2 energy: give a unit +2 Might this turn
const FILLER_SPELL = "ogn-004-298"; // Cleave, just a card to hide facedown

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 1, name: "MySmall" }, "mySmall")
    .unit(P1, "bf2", { might: 2, name: "MyTwo" }, "myTwo")
    .unit(P1, "base", { might: 3, name: "MyThree" }, "myThree")
    .unit(P2, "base", { might: 2, name: "TheirTwo" }, "theirTwo")
    .unit(P2, "bf1", { might: 1, name: "TheirOne" }, "theirOne")
    .unit(P2, "bf1", { might: 4, name: "TheirBig" }, "theirBig")
    .hand(P1, CARD, "beast");
}

describe("Angler Beast (unl-132-219)", () => {
  test("registry payload: one play-self trigger returning ALL units with might ≤ 2 to hand (no controller filter, not optional)", async () => {
    const game = await scenario().hand(P1, CARD, "beast").build();
    expect(game.state("beast")).toMatchObject({ baseMight: 5, cardType: "unit", energyCost: 5, name: "Angler Beast" });
    expect(game.state("beast").powerCost).toEqual(["chaos"]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { target: { filter: { might: { lte: 2 } }, quantity: "all", type: "unit" }, type: "return-to-hand" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 5 energy + 1 chaos; enters base exhausted with its trigger on the chain; short on either resource → not playable", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.state("beast").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", controller: P1, triggered: true })]);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "beast").build();
    expect(noPower.p1.can("play", "beast")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { chaos: 2 } }).hand(P1, CARD, "beast").build();
    expect(lowEnergy.p1.can("play", "beast")).toBe(false);
  });

  test("sweeps every unit at 2 or less — both sides, base and battlefields — and leaves 3+, the Beast, and battlefield control alone", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    await game.settle();
    expect(game.zoneOf("mySmall")).toBe("hand");
    expect(game.zoneOf("myTwo")).toBe("hand");
    expect(game.zoneOf("theirTwo")).toBe("hand");
    expect(game.zoneOf("theirOne")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["mySmall", "myTwo"]);
    expect(game.p2.hand().sort()).toEqual(["theirOne", "theirTwo"]);
    expect(game.zoneOf("myThree")).toBe("base");
    expect(game.zoneOf("theirBig")).toBe("battlefield-bf1");
    expect(game.zoneOf("beast")).toBe("base");
    // 190.4.c: P1 has no unit left at bf2 → loses control in the cleanup (nobody conquers it);
    // P2 still has TheirBig at bf1 and keeps it. No points either way.
    expect(game.gameState.battlefields.bf2?.controller).toBe(null);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("current Might, not printed: a BUFFED printed-2 unit (3) stays; a DAMAGED 3-Might unit stays; a printed-3 unit at -1 (2) goes", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .unit(P2, "base", { might: 2, name: "Buffed" }, "buffedTwo", { buffed: true })
      .unit(P2, "base", { might: 3, name: "Hurt" }, "hurtThree", { damage: 2 })
      .unit(P2, "base", { might: 3, name: "Shrunk" }, "shrunk", { mightModifier: -1 })
      .hand(P1, CARD, "beast")
      .build();
    expect(game.state("buffedTwo").might).toBe(3);
    expect(game.state("hurtThree").might).toBe(3);
    expect(game.state("shrunk").might).toBe(2);
    await game.p1.play("beast");
    await game.settle();
    expect(game.zoneOf("buffedTwo")).toBe("base");
    expect(game.zoneOf("hurtThree")).toBe("base");
    expect(game.zoneOf("shrunk")).toBe("hand");
  });

  test("'their OWNERS' hands': a 2-Might unit P1 controls but P2 owns returns to P2's hand, not P1's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .hand(P1, CARD, "beast")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.play("beast");
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand()).toContain("stolen");
    expect(game.p1.hand()).not.toContain("stolen");
  });

  test("not targeted: an enemy 1-Might Deflect token (Bird) is returned with no [rainbow] paid — and, being a token, ceases to exist (186.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", BIRD, "token-bird")
      .hand(P1, CARD, "beast")
      .build();
    expect(game.state("token-bird").keywords).toContain("Deflect");
    await game.p1.play("beast");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // no Deflect surcharge
    await game.settle();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p2.hand()).not.toContain("token-bird");
    expect(!game.has("token-bird") || !["hand", "battlefield-bf1"].includes(game.zoneOf("token-bird"))).toBe(true);
  });

  test("on the chain first: P2 Reacts with Feral Strength (+2) on their 2-Might unit → it is 4 at resolution and stays; the 1-Might one still goes", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FERAL_STRENGTH, "fs").build();
    await game.p1.play("beast", { to: "base" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("fs", { targets: "theirTwo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["beast", "fs"]);
    await game.settle();
    expect(game.state("theirTwo").might).toBe(4);
    expect(game.zoneOf("theirTwo")).toBe("base");
    expect(game.zoneOf("theirOne")).toBe("hand");
    expect(game.zoneOf("mySmall")).toBe("hand");
  });

  test("empty case: with no unit at 2 or less anywhere the trigger resolves and nothing moves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "mine")
      .unit(P2, "bf1", { might: 5 }, "theirs")
      .hand(P1, CARD, "beast")
      .build();
    await game.p1.play("beast");
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("returned units come back as fresh cards: damage and exhaustion are gone when replayed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .unit(P2, "base", { energyCost: 1, might: 2, name: "Scratched" }, "scr", { damage: 1, exhausted: true })
      .hand(P1, CARD, "beast")
      .build();
    await game.p1.play("beast");
    await game.settle();
    expect(game.zoneOf("scr")).toBe("hand");
    expect(game.state("scr").damage).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune();
    await game.p2.play("scr");
    await game.settle();
    expect(game.zoneOf("scr")).toBe("base");
    expect(game.state("scr").damage).toBe(0);
  });

  test("facedown cards at a battlefield are not units on the board — they stay hidden", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "guard")
      .facedown(P2, "bf1", FILLER_SPELL, "secret")
      .hand(P1, CARD, "beast")
      .build();
    await game.p1.play("beast");
    await game.settle();
    expect(game.zoneOf("secret")).toBe("facedown-bf1");
    expect(game.p2.hand()).toEqual([]);
  });

  test("only 'when you PLAY me': an Angler Beast already on the board does nothing when another unit is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "beast")
      .unit(P2, "base", { might: 1 }, "tiny")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Newcomer" }, "newcomer")
      .build();
    await game.p1.play("newcomer");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("newcomer")).toBe("base");
    expect(game.zoneOf("tiny")).toBe("base");
  });
});
