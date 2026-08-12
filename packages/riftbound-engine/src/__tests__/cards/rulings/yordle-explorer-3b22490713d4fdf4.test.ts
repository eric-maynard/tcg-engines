/**
 * Ruling 3b22490713d4fdf4 — Yordle Explorer (SFD-100 → sfd-100-221) · 4 Might
 *     "When you play a card with Power cost [rainbow][rainbow] or more, draw 1."
 *   × Ekko, Recurrent (OGN-110 → ogn-110-298) · [5][mind] · "[Accelerate] (pay [1][mind] to enter ready)"
 *   × Bellows Breath (SFD-080 → sfd-080-221) · [1][mind] · "[Repeat] [1][mind] …"
 *   × Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] (the printed-two-Power control)
 *
 * Q: Do [Repeat] and [Accelerate] payments count towards Yordle Explorer's trigger?
 * A: No. Effects that need a card's cost always use its BASE (printed) cost, even when that cost is
 *    altered as the card is played. The Explorer counts the Power symbols printed in the cost box only;
 *    additional costs such as Accelerate and Repeat are never included.
 * Rules: 206.1 / 208.2 (cost checks read the printed base cost), 356.4 (additional costs change what is
 *        paid, not what the card costs), 820 ([Repeat] is an additional cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YORDLE_EXPLORER = "sfd-100-221";
const EKKO = "ogn-110-298"; // printed [5][mind] = ONE Power pip; Accelerate costs another [1][mind]
const BELLOWS_BREATH = "sfd-080-221"; // printed [1][mind] = ONE Power pip; Repeat costs another [1][mind]
const FALLING_STAR = "ogn-029-298"; // printed [2][fury][fury] = TWO Power pips
const SKULKER = "ogn-175-298";

describe("Ruling 3b22490713d4fdf4 — Yordle Explorer counts PRINTED Power pips; Accelerate and Repeat payments don't count", () => {
  test("control: a card with two PRINTED Power pips (Falling Star) makes the Explorer draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .unit(P2, "base", { might: 9, name: "Dummy" }, "dummy")
      .hand(P1, FALLING_STAR, "star")
      .deck(P1, [SKULKER], ["d1"])
      .build();
    expect(game.state("star").powerCost).toHaveLength(2);
    await game.p1.cast("star", { targets: ["dummy", "dummy"] });
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("ACCELERATE: Ekko's printed cost has one pip; paying the extra [1][mind] to enter ready spends two pips in total — and the Explorer still does NOT draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, EKKO, "ekko")
      .deck(P1, [SKULKER], ["d1"])
      .build();
    expect(game.state("ekko").powerCost).toHaveLength(1); // printed: one pip
    await game.p1.play("ekko", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("ekko")).toBe("base");
    expect(game.state("ekko").isReady).toBe(true); // the Accelerate cost really was paid
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // two pips spent
    expect(game.p1.hand()).toEqual([]); // …no draw
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("REPEAT: Bellows Breath's printed cost has one pip; paying the Repeat spends two — the Explorer still does NOT draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .unit(P2, "bf1", { might: 5, name: "Grunt" }, "grunt")
      .hand(P1, BELLOWS_BREATH, "bellows")
      .deck(P1, [SKULKER], ["d1"])
      .build();
    expect(game.state("bellows").powerCost).toHaveLength(1);
    await game.p1.cast("bellows", { repeat: 1, targets: ["grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // two pips spent
    await game.settle();
    expect(game.state("grunt").damage).toBe(2); // both executions happened
    expect(game.p1.hand()).toEqual([]); // …still no draw
    expect(game.violations()).toEqual([]);
  });

  test("and the same Bellows Breath / Ekko without the extra payment behaves identically — one printed pip is one printed pip", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, EKKO, "ekko")
      .deck(P1, [SKULKER], ["d1"])
      .build();
    await game.p1.play("ekko", { accelerate: false });
    await game.settle();
    expect(game.state("ekko").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual([]);
  });
});
