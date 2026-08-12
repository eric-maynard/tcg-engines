/**
 * Ruling accc69fae2d74c71 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1][chaos] · [Reaction]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Gust bounces a Recruit unit TOKEN. Does the token go to its owner's hand, or cease to exist?
 * A: It is returned to hand and then immediately ceases to exist — a token in any non-board zone stops
 *    existing. It is removed, but it did not DIE, so "when a unit dies" abilities do not trigger.
 * Rules: 186.1 (a token that leaves the board ceases to exist), 426 (return to hand ≠ a death).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RECRUIT = "ogn-271-298"; // printed 1-Might Recruit unit token

/** A P2 watcher that would draw if any friendly unit died — the oracle for "this was not a death". */
const MOURNER = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "die", on: "friendly-units" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 4,
  name: "Mourner",
} as const;

/** P1's turn. P2 holds bf1 with a Recruit token and a Mourner watching for deaths. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RECRUIT, "recruit")
    .unit(P2, "bf1", MOURNER, "mourner")
    .hand(P1, GUST, "gust");
}

describe("Ruling accc69fae2d74c71 — Gusting a Recruit token removes it without a death", () => {
  test("the target really is a token", async () => {
    const game = await board().build();
    expect(game.state("recruit").isToken).toBe(true);
    expect(game.state("recruit").might).toBe(1);
  });

  test("ruling: the token is returned to hand and ceases to exist — it is in NO zone, not P2's hand and not a trash card", async () => {
    const game = await board().build();
    const handBefore = game.p2.hand().length;
    await game.p1.cast("gust", { targets: "recruit" });
    await game.settle();

    expect(game.has("recruit")).toBe(false);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.locationOf("recruit")).toBeUndefined();
    expect(game.p2.hand()).not.toContain("recruit");
    expect(game.p2.trash()).not.toContain("recruit");
    expect(game.p2.hand().length).toBe(handBefore); // nothing arrived in hand either
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("nuance: this is not 'dying' — a 'when a friendly unit dies' watcher does not trigger", async () => {
    const game = await board().build();
    const handBefore = game.p2.hand().length;
    await game.p1.cast("gust", { targets: "recruit" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand().length).toBe(handBefore); // the Mourner never drew
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a non-token unit Gusted from the battlefield really does land in its owner's hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire")
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.cast("gust", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.p2.hand()).toContain("squire");
  });
});
