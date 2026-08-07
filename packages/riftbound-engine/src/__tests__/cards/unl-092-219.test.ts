/**
 * Demacian Diplomat — unl-092-219 · Unit · Body · 2 energy (no power) · 2 Might
 *
 *   When you play me, gain 1 XP.
 *
 * Rules: 383.4.a (play effects are triggered abilities that go on the chain once the unit has been
 * played), 392-ish independence (a triggered ability resolves even if its source left the board),
 * 730.1 (Gain XP = increase the player's XP), 729.2 (XP is public), 143.4 (units enter exhausted).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "When you PLAY me" — only the play action: a Diplomat that starts on the board, moves, fights or
 *      dies never grants XP; nor does the opponent gain anything.
 *   2. The XP arrives when the TRIGGER resolves, not when the unit lands: with the trigger still on the
 *      chain XP is unchanged, and killing the Diplomat in response does not stop the XP (the ability is
 *      independent of its source once on the chain).
 *   3. It stacks — each Diplomat played is +1, and XP persists across turns (it is not a "this turn"
 *      resource) while "gained XP this turn" partners (Wily Newtfish) turn OFF next turn.
 *   4. Threshold partners: at 5 XP a Diplomat is exactly what flips [Level 6] (Gemhand Hunter +1 Might);
 *      at 4 XP it is one short.
 *   5. Cost: exactly 2 energy, no power; 1 energy is not enough; enters exhausted as a 2-Might body.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-092-219";
const GEMHAND = "unl-094-219"; // 2-Might body unit: [Level 6] I have +1 Might
const NEWTFISH = "unl-108-219"; // 4-Might body unit: if you've gained XP this turn, +1 Might and Ganking

function inHand(energy = 2) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "dip");
}

describe("Demacian Diplomat (unl-092-219)", () => {
  test("parsed abilities match the printed text: a single play-self trigger that gains 1 XP; 2 energy, no power, 2 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 2, name: "Demacian Diplomat" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "play-self" }, type: "triggered" }]);
  });

  test("cost: 2 energy deducted, enters the base exhausted as a 2-Might unit; with 1 energy it is not playable", async () => {
    const game = await inHand().build();
    await game.p1.play("dip");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("dip")).toBe("base");
    expect(game.state("dip")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
    expect((await inHand(1).build()).p1.can("play", "dip")).toBe(false);
  });

  test("when played, the trigger goes on the chain; XP is 0 until it resolves, then exactly 1 — the opponent gains nothing", async () => {
    const game = await inHand().build();
    expect(game.p1.xp()).toBe(0);
    await game.p1.play("dip");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dip", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("XP persists into later turns (not a this-turn resource)", async () => {
    const game = await inHand().xp(P1, 3).build();
    await game.p1.play("dip");
    await game.settle();
    expect(game.p1.xp()).toBe(4);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(4);
  });

  test("stacks: two Diplomats played in one turn give 2 XP", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "d1").hand(P1, CARD, "d2").build();
    await game.p1.play("d1");
    await game.settle();
    await game.p1.play("d2");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.units("base").sort()).toEqual(["d1", "d2"]);
  });

  test("negative space: a Diplomat already on the board that moves, fights and wins grants no XP; neither does one that dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "dip")
      .unit(P1, "base", CARD, "victim")
      .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("dip", "bf1");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(0);
    // Next turn P2 attacks and kills the other Diplomat: still no XP for anyone from Diplomat text.
    await game.advanceTurn();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("dip")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
  });

  test("the trigger is independent of its source: P2 kills the Diplomat in response, P1 still gains 1 XP", async () => {
    const ZAP = {
      abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Zap",
      rulesText: "[Reaction] Deal 2 to a unit.",
      timing: "reaction",
    };
    const game = await inHand().hand(P2, ZAP, "zap").build();
    await game.p1.play("dip");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("zap", { targets: "dip" });
    expect(game.chain()).toHaveLength(2);
    await game.settle();
    expect(game.zoneOf("dip")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
  });

  // Expected: Newtfish is a plain 4 until XP is gained this turn, 5 + Ganking after the Diplomat's
  // trigger resolves, 4 again on the next turn. Actual: Newtfish's "If you've gained XP this turn"
  // parsed to an always-on `custom` condition, so it is 5/Ganking before any XP was gained.
  test("Wily Newtfish's 'gained XP this turn' condition is always on — the Diplomat's XP should be what turns it on (364.3.a)", async () => {
    const game = await inHand().unit(P1, "base", NEWTFISH, "newt").build();
    expect(game.state("newt").might).toBe(4);
    await game.p1.play("dip");
    await game.settle();
    expect(game.state("newt").might).toBe(5);
    expect(game.state("newt").keywords).toContain("Ganking");
    await game.advanceTurn(); // P2's turn: P1 gained no XP "this turn"
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
  });

  test("partner — Gemhand Hunter [Level 6]: at 5 XP the Diplomat's point is exactly the threshold (2 → 3 Might); at 4 XP it stays 2", async () => {
    const hit = await inHand().xp(P1, 5).unit(P1, "base", GEMHAND, "gem").build();
    expect(hit.state("gem").might).toBe(2);
    await hit.p1.play("dip");
    await hit.settle();
    expect(hit.p1.xp()).toBe(6);
    expect(hit.state("gem").might).toBe(3);

    const miss = await inHand().xp(P1, 4).unit(P1, "base", GEMHAND, "gem").build();
    await miss.p1.play("dip");
    await miss.settle();
    expect(miss.p1.xp()).toBe(5);
    expect(miss.state("gem").might).toBe(2);
  });

  test("played to a battlefield you control also triggers (destination does not matter)", async () => {
    const game = await inHand().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await game.p1.play("dip", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("dip")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(1);
  });
});
