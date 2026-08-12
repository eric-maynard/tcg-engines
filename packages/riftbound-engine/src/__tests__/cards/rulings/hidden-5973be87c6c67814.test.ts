/**
 * Ruling 5973be87c6c67814 — Teemo, Scout (OGN-197 → ogn-197-298) · 1 Might ·
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) / When you play me, give me +3
 *   [Might] this turn."
 *
 * Q: When you play a unit from hidden, does it come into play exhausted?
 * A: Yes. Playing from hidden changes HOW you play the unit (timing and cost), not the rules for what
 *    happens when a unit enters — units enter exhausted either way.
 * Rules: 811.1 ([Hidden]: the facedown card is played as a Reaction), 421.1 (units enter the board
 *        exhausted unless an effect such as [Accelerate] says otherwise), 383 ("when you play me"
 *        triggers fire on a hidden play too — it really is a play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-197-298";

describe("Ruling 5973be87c6c67814 — a unit played from hidden enters exhausted, just like any other unit", () => {
  test("the facedown card is hidden and off the board until it is played", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO, "teemo")
      .build();
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
  });

  test("revealing it plays it: Teemo arrives at bf1 EXHAUSTED, and his \"when you play me\" trigger fires", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO, "teemo")
      .build();
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    expect(game.state("teemo").isExhausted).toBe(true);
    expect(game.state("teemo").isReady).toBe(false);
    expect(game.state("teemo").might).toBe(4); // 1 + the play trigger's +3 this turn
    expect(game.violations()).toEqual([]);
  });

  test("an exhausted arrival cannot then be moved this turn — the hidden play buys surprise Might, not a free attack", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .facedown(P1, "bf1", TEEMO, "teemo")
      .build();
    await game.p1.reveal("teemo");
    await game.settle();
    const moved = await game.p1.try((p) => p.move("teemo", "bf2"));
    expect(moved.ok).toBe(false);
    expect(game.locationOf("teemo")).toBe("bf1");
  });

  test("control: the same Teemo played from HAND also enters exhausted — the hidden route changed nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, TEEMO, "teemo")
      .build();
    await game.p1.play("teemo", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isExhausted).toBe(true);
  });
});
