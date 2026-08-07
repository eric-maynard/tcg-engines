/**
 * Wily Newtfish — unl-108-219 · Unit · Body · 4 energy (no power) · 4 Might
 *
 *   If you've gained XP this turn, I have +1 [Might] and [Ganking].
 *   (I can move from battlefield to battlefield.)
 *
 * Rules: 364.3.a (a CONDITIONAL passive — "if …" — continuously re-evaluated, no chain item),
 * 730.1 (Gain XP = increase the marked value; Spending XP, 730.2, is a different action), 810 /
 * 144.4.c.1 (Ganking = the Standard Move may go battlefield → battlefield; it adds a permission and
 * costs nothing), 108.2 ("you" = the Newtfish's controller), 823 (Hunt's hold XP arrives in YOUR
 * Beginning Phase — i.e. "this turn"), 477-ish turn-scoped bookkeeping resets when the turn ends.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. OFF by default even with a pile of XP banked from earlier turns: the gate is "gained THIS turn",
 *     not "have XP". And SPENDING XP (Crowd Favorite) is not gaining it.
 *  2. It flips the moment XP is actually gained — with Demacian Diplomat's play trigger still on the
 *     chain the Newtfish is a plain 4; once it resolves it is 5 + Ganking, with no chain item of its own.
 *  3. Ganking is a real permission: before XP the bf1 → bf2 move is simply not on the menu; after XP
 *     the same unit ganks, fights at 5 Might (kills a 4, survives its 4 damage) and conquers.
 *  4. Expiry across game.advanceTurn(): on the opponent's turn it is 4 / no Ganking again although
 *     the XP itself persists; the OPPONENT gaining XP on their turn never turns MY Newtfish on.
 *  5. Hold XP counts: Gemhand Hunter holding at the start of my turn means I have "gained XP this
 *     turn" for the whole main phase → Newtfish wakes up 5 + Ganking.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-108-219";
const DIPLOMAT = "unl-092-219"; // Body 2: When you play me, gain 1 XP.
const GEMHAND = "unl-094-219"; // Body 2: [Hunt] (conquer/hold → 1 XP) / [Level 6] +1 Might
const CROWD_FAVORITE = "unl-102-219"; // Body 3: [Hunt] / Spend 2 XP: Buff me.

/** P1's main phase: Newtfish ready at bf1 (P1's), bf2 open, Diplomat in hand with 2 energy to play it. */
function gankBoard() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", CARD, "newt")
    .hand(P1, DIPLOMAT, "dip");
}

describe("Wily Newtfish (unl-108-219)", () => {
  test("registry payload: ONE conditional static (xp-gained-this-turn) granting +1 might and Ganking to self — 4-cost body unit, 4 Might, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, might: 4, name: "Wily Newtfish" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        condition: { type: "xp-gained-this-turn" },
        effect: {
          effects: [
            { amount: 1, target: "self", type: "modify-might" },
            { keyword: "Ganking", target: { type: "self" }, type: "grant-keyword" },
          ],
          type: "sequence",
        },
        type: "static",
      },
    ]);
  });

  test("cost: exactly 4 energy, no power; enters the base exhausted as a plain 4-Might unit without Ganking; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "newt").build();
    await game.p1.play("newt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("newt")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("newt").keywords).not.toContain("Ganking");
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "n").build()).p1.can("play", "n")).toBe(false);
  });

  test("negative space — XP banked from EARLIER turns is not 'gained this turn': 7 XP, still 4 Might, no Ganking, bf1 → bf2 not offered", async () => {
    const game = await gankBoard().xp(P1, 7).build();
    expect(game.p1.xp()).toBe(7);
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "newt")).toBe(false);
    // The only standard move from a battlefield is back to base.
    expect((await game.p1.try((p) => p.move("newt", "bf2"))).ok).toBe(false);
    expect(game.locationOf("newt")).toBe("bf1");
  });

  test("flips exactly when XP is gained: Diplomat's trigger on the chain → still 4; resolved → 5 Might + Ganking, and no Newtfish chain item", async () => {
    const game = await gankBoard().build();
    await game.p1.play("dip", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dip", triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("newt")).toMatchObject({ baseMight: 4, might: 5 });
    expect(game.state("newt").keywords).toContain("Ganking");
    expect(game.violations()).toEqual([]);
  });

  test("Ganking is a real permission (810.1.b): after gaining XP the Newtfish moves bf1 → open bf2, arrives exhausted and conquers it (+1 point)", async () => {
    const game = await gankBoard().build();
    await game.p1.play("dip", { to: "base" });
    await game.settle();
    expect(game.p1.can("gank", "newt")).toBe(true);
    await game.p1.gank("newt", "bf2");
    await game.settle();
    expect(game.locationOf("newt")).toBe("bf2");
    expect(game.state("newt").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("the +1 fights: ganking into a 4-Might defender at bf2, the 5-Might Newtfish kills it, survives the 4 damage and conquers", async () => {
    const game = await gankBoard().battlefield("bf3", { controller: P2 }).unit(P2, "bf3", { might: 4, name: "Warden" }, "warden").build();
    await game.p1.play("dip", { to: "base" });
    await game.settle();
    await game.p1.gank("newt", "bf3");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("newt")).toBe("bf3");
    expect(game.state("newt").damage).toBe(0); // healed in the combat cleanup
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // Control: WITHOUT the XP the same unit could not even have made the move.
    const cold = await gankBoard().battlefield("bf3", { controller: P2 }).unit(P2, "bf3", { might: 4 }, "warden").build();
    expect(cold.p1.can("gank", "newt")).toBe(false);
  });

  test("'this turn' expires across game.advanceTurn(): on P2's turn the Newtfish is 4 / no Ganking again while the XP stays banked; P2 gaining XP on THEIR turn does not wake MY Newtfish (108.2)", async () => {
    const game = await gankBoard().hand(P2, DIPLOMAT, "theirDip").build();
    await game.p1.play("dip", { to: "base" });
    await game.settle();
    expect(game.state("newt").might).toBe(5);
    await game.advanceTurn(); // pools empty at end of turn; P2 channels 2 runes
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
    await game.p2.tapRunes(2);
    await game.p2.play("theirDip");
    await game.settle();
    expect(game.p2.xp()).toBe(1);
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
  });

  test("negative space — SPENDING XP is not gaining it (730.2): Crowd Favorite spends 2 of 3 banked XP → Newtfish stays 4 with no Ganking", async () => {
    const game = await scenario().xp(P1, 3).unit(P1, "base", CARD, "newt").unit(P1, "base", CROWD_FAVORITE, "fav").build();
    await game.p1.activate("fav");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("fav").isBuffed).toBe(true);
    expect(game.state("newt").might).toBe(4);
    expect(game.state("newt").keywords).not.toContain("Ganking");
  });

  test("hold XP counts as 'this turn': Gemhand Hunter holds bf1 at the start of MY turn → 1 XP → the Newtfish in base is 5 + Ganking for the main phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GEMHAND, "gem")
      .unit(P1, "base", CARD, "newt")
      .build();
    expect(game.state("newt").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("newt").might).toBe(5);
    expect(game.state("newt").keywords).toContain("Ganking");
  });

  test("conquer XP mid-turn (Gemhand walks onto open bf2) also wakes a Newtfish that is still in hand-then-played: played AFTER the XP it is 5 + Ganking on arrival", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", GEMHAND, "gem")
      .hand(P1, CARD, "newt")
      .build();
    await game.p1.move("gem", "bf2");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await game.p1.play("newt", { to: "base" });
    await game.settle();
    expect(game.state("newt")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.state("newt").keywords).toContain("Ganking");
    // Exhausted from entering: Ganking or not, it cannot move this turn.
    expect(game.p1.can("gank", "newt")).toBe(false);
  });

  // Expected (191.4.a — an ability's controller is its source's controller, so the passive's "you"
  // is P2): P2 gaining XP turns the stolen Newtfish on. Actual: the xp-gained-this-turn condition
  // reads the card OWNER's ledger (P1's), unlike the sibling while-level check which reads the
  // controller — the Newtfish stays 4 / no Ganking.
  test("'you've gained XP' is evaluated for the OWNER, not the CONTROLLER — a P1-owned Newtfish under P2's control should wake when P2 gains XP (191.4.a)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .card("newt", { controller: P2, def: CARD, owner: P1, zone: "bf1" })
      .hand(P2, DIPLOMAT, "theirDip")
      .build();
    expect(game.state("newt")).toMatchObject({ controller: P2, might: 4, owner: P1 });
    await game.p2.play("theirDip", { to: "base" });
    await game.settle();
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("newt").might).toBe(5);
    expect(game.state("newt").keywords).toContain("Ganking");
  });
});
