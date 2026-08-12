/**
 * Ruling e418f2f28a736735 — Showstopper (OGN-270 → ogn-270-298) · [Action] · Body/Order · [1][rainbow]
 *     "Buff a friendly unit in your base, then move it to a battlefield.
 *      (If it doesn't have a buff, it gets a +1 [Might] buff.)"
 *
 * Q: Can I play Showstopper on a unit in my base that is already buffed?
 * A: Yes — it stays a legal play. The already-buffed unit simply gains no second buff (only one Buff per
 *    unit), but the rest of the card still happens: it moves to a battlefield.
 * Rules: 426.1.c (an effect that can do part of what it says is still legal to play), 702.3 / 702.3.a
 *        (one Buff per unit; a second is not placed), 355.4 (the move destination is chosen at play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";

/**
 * P1's turn. Star (3 Might) sits buffed in P1's base, Rookie (3 Might) unbuffed beside her.
 * bf1 is open, bf2 is P2's. Showstopper in hand with [1] + a Body power.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", { might: 3, name: "Star" }, "star", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Rookie" }, "rookie")
    .hand(P1, SHOWSTOPPER, "showstopper");
}

describe("Ruling e418f2f28a736735 — Showstopper on an already-buffed base unit: legal, no second buff, still moves", () => {
  test("the buffed Star is a legal choice for Showstopper alongside the unbuffed Rookie", async () => {
    const game = await board().build();
    expect(game.state("star").isBuffed).toBe(true);
    expect(game.state("star").might).toBe(4); // 3 printed + the +1 buff
    const targets = (game.p1.option("cast", "showstopper")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(new Set(targets)).toEqual(new Set(["star", "rookie"]));
  });

  test("ruling: the Star gets no additional buff — she is still 4 Might, with one buff — but she does move to bf1", async () => {
    const game = await board().build();
    await game.p1.cast("showstopper", { targets: "star", answers: ["bf1"] });
    await game.settle();
    expect(game.state("star").isBuffed).toBe(true);
    expect(game.state("star").might).toBe(4); // NOT 5: the second buff is not placed (702.3.a)
    expect(game.locationOf("star")).toBe("bf1");
    expect(game.zoneOf("showstopper")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the unbuffed Rookie does gain the +1 buff from the same spell and then moves", async () => {
    const game = await board().build();
    expect(game.state("rookie").isBuffed).toBe(false);
    await game.p1.cast("showstopper", { targets: "rookie", answers: ["bf1"] });
    await game.settle();
    expect(game.state("rookie").isBuffed).toBe(true);
    expect(game.state("rookie").might).toBe(4);
    expect(game.locationOf("rookie")).toBe("bf1");
  });

  test("the move half is genuinely a move: sending the buffed Star into P2's bf2 contests it and opens a showdown", async () => {
    const game = await board().build();
    await game.p1.cast("showstopper", { targets: "star", answers: ["bf2"] });
    await game.settle();
    expect(game.locationOf("star")).toBe("bf2");
    expect(game.state("star").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
