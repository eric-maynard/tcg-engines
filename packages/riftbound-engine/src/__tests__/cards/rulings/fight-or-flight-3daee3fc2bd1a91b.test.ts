/**
 * Ruling 3daee3fc2bd1a91b — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Hidden] [Action]
 *   "Move a unit from a battlefield to its base."
 *
 * Q: Fight or Flight is played on a READY unit — does that unit exhaust when the spell moves it?
 * A: No. Only a STANDARD move carries the implicit "exhaust yourself" cost. When a spell says "move",
 *    you do exactly what the spell says and nothing else, so the unit arrives at its base still ready.
 * Rules: 448 (Standard Move — exhaust as a cost), 449 (effect-driven movement performs only the
 *        instruction), 355.4 (destination fixed by the effect: "to its base").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

describe("Ruling 3daee3fc2bd1a91b — Fight or Flight moves without exhausting", () => {
  test("a READY unit moved home by Fight or Flight is still ready (no implicit exhaust cost)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    expect(game.state("runner")).toMatchObject({ isExhausted: false, isReady: true });

    await game.p1.cast("fof", { targets: "runner" });
    await game.settle();

    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base");
    // the ruling's whole point: the spell moved it, so no exhaust cost was paid
    expect(game.state("runner")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("an EXHAUSTED unit can be moved home by the spell too — a standard move could not even be made", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner", { exhausted: true })
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    expect(game.state("runner").isExhausted).toBe(true);

    await game.p1.cast("fof", { targets: "runner" });
    await game.settle();

    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").isExhausted).toBe(true); // unchanged — the spell neither exhausts nor readies
  });

  test("contrast — a STANDARD move DOES exhaust the mover", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .unit(P2, "base", { might: 1 }, "bystander")
      .build();
    expect(game.state("walker").isReady).toBe(true);

    await game.p1.move("walker", "bf1");

    expect(game.locationOf("walker")).toBe("bf1");
    expect(game.state("walker").isExhausted).toBe(true);
  });
});
