/**
 * Ruling 87db91ecd68b31ea — Teemo, Scout (OGN-197 → ogn-197-298) · Unit · Chaos · [2] · 1 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) When you play me, give me +3 [Might] this turn."
 *
 * Q: Can you hide cards from your base, or only from your hand / Champion Zone?
 * A: Only from your hand or the Champion Zone. A Teemo already standing in your base cannot be hidden — the Hide
 *    action is not available to cards on the board. You hide facedown at a battlefield you control that has no
 *    facedown card yet, and the hidden card only becomes playable (as a [Reaction], ignoring its cost) from the
 *    next turn on.
 * Rules: 811.1.b / 421.2.a (Hide is legal from hand or Champion Zone), 723.1.b (the Hide cost is [rainbow]),
 *        811.1.c (one facedown card per battlefield, at a battlefield you control), 811.1.d (playable from the
 *        following turn as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn. P1 durably controls bf1 (a body standing there); bf2 is P2's, bf3 is open. Pool: [rainbow][rainbow]. */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirholder")
    .unit(P1, "base", TEEMO_SCOUT, "onboard")
    .hand(P1, TEEMO_SCOUT, "inhand")
    .champion(P1, TEEMO_SCOUT, "champ"); // Teemo, Scout is itself a Champion card
}

describe("Ruling 87db91ecd68b31ea — Hide comes from the hand or the Champion Zone, never from the board", () => {
  test("a Teemo in HAND can be hidden at a battlefield P1 controls, for [rainbow]", async () => {
    const game = await board().build();
    expect(game.zoneOf("inhand")).toBe("hand");
    await game.p1.hide("inhand", "bf1");
    expect(game.zoneOf("inhand")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["inhand"]);
    expect(game.p1.power("rainbow")).toBe(1); // one Power paid
  });

  test("the identical Teemo already standing in P1's BASE cannot be hidden — the action is not offered and is rejected", async () => {
    const game = await board().build();
    expect(game.zoneOf("onboard")).toBe("base");
    expect(game.p1.can("hide", "onboard")).toBe(false);
    expect((await game.p1.try((p) => p.hide("onboard", "bf1"))).ok).toBe(false);
    expect(game.zoneOf("onboard")).toBe("base");
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("a card in the CHAMPION ZONE can be hidden, same as one in hand", async () => {
    const game = await board().build();
    expect(game.p1.champion()).toBe("champ");
    expect(game.p1.can("hide", "champ")).toBe(true);
    await game.p1.hide("champ", "bf1");
    expect(game.zoneOf("champ")).toBe("facedown-bf1");
  });

  test("destination limits: only a battlefield P1 controls, and only one facedown card there", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.hide("inhand", "bf2"))).ok).toBe(false); // P2's battlefield
    expect((await game.p1.try((p) => p.hide("inhand", "bf3"))).ok).toBe(false); // uncontrolled
    await game.p1.hide("inhand", "bf1");
    expect((await game.p1.try((p) => p.hide("champ", "bf1"))).ok).toBe(false); // already one facedown there
    expect(game.p1.facedown("bf1")).toEqual(["inhand"]);
  });

  test("a card hidden this turn is not yet playable; from the next turn on it can be revealed", async () => {
    const game = await board().build();
    await game.p1.hide("inhand", "bf1");
    expect(game.p1.can("reveal", "inhand")).toBe(false);
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // back to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("reveal", "inhand")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
