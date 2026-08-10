/**
 * Ruling a42f51c92e3ec67f — Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less
 *     to its owner's hand."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might · "When another non-Recruit unit you control dies, play a 1 [Might] Recruit
 *     unit token into your base."   Token used: Sprite (ogn-274-298, 3 Might, [Temporary]).
 *
 * Q: A Sprite token is returned to hand by Gust while Viktor, Leader is in play — does it count as dying?
 * A: No. Gust returns the token to hand, where it immediately ceases to exist; that is not "dying", so Viktor does not trigger.
 * Rules: 186.1 (a token that leaves the board ceases to exist), 415/421 (die = killed: board → trash), 383.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VIKTOR_LEADER = "ogn-246-298";
const SPRITE = "ogn-274-298";

/** P1's turn. P1: Viktor, Leader in base, a Sprite token at P1's bf1, Gust in hand with [1] (Gusting your own token is legal). */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, GUST, "gust");
}

describe("Ruling a42f51c92e3ec67f — a Gusted Sprite token ceases to exist; it did not die, so Viktor, Leader stays quiet", () => {
  test("Gust resolves on the Sprite: it leaves the battlefield, reaches no hand and no trash — it is simply gone (186.1)", async () => {
    const game = await board().build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, might: 3, zone: "battlefield-bf1" });
    const hand = game.p1.hand().length;
    await game.p1.cast("gust", { targets: "sprite" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.has("sprite")).toBe(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.hand()).toHaveLength(hand - 1); // Gust left; no Sprite arrived
    expect(game.p1.trash()).toEqual(["gust"]); // the Sprite was not killed
  });

  test("Viktor's 'when another unit you control dies' does NOT trigger: nothing on the chain, no Recruit token, straight back to P1's main phase", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "sprite" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.findAll({ name: "Recruit" })).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["viktor"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Sprite KILLED (3 damage) does die — Viktor triggers and a Recruit appears in P1's base", async () => {
    const bolt = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Bolt", timing: "action" };
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "bf1", SPRITE, "sprite")
      .hand(P1, bolt, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "sprite" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.findAll({ name: "Recruit", zone: "base" })).toHaveLength(1);
  });
});
