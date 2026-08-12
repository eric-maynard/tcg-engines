/**
 * Ruling 87006182e37068c8 — Unforgiven (OGN-259 → ogn-259-298) · Legend · Calm/Chaos
 *     "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: When Yasuo's legend ability moves a unit from a battlefield to base, does that unit become exhausted?
 * A: No. It stays exactly as it was — ready stays ready, exhausted stays exhausted. Spells and abilities that move
 *    units never change their ready/exhausted state unless they say so.
 * Rules: 445 (moving is only a change of location), 320 (ready/exhausted changes only when an effect says so).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";

/** P1's turn with [2] and a ready Unforgiven legend; a READY Scout and an EXHAUSTED Veteran both at P1's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { exhausted: true })
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home");
}

describe("Ruling 87006182e37068c8 — Unforgiven's move leaves the unit's ready/exhausted state alone", () => {
  test("a READY unit moved from the battlefield to base is still ready afterwards (only the legend itself exhausts)", async () => {
    const game = await board().build();
    expect(game.state("scout").isExhausted).toBe(false);
    await game.p1.activate("yasuo", 0, { targets: "scout" });
    expect(game.p1.energy()).toBe(0); // the [2]
    await game.settle({ policy: "first" });
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").isExhausted).toBe(false);
    expect(game.state("yasuo").isExhausted).toBe(true); // [Exhaust] was the legend's own cost
    expect(game.violations()).toEqual([]);
  });

  test("ruling 87006182e37068c8 — an EXHAUSTED unit moved to base stays exhausted: the move readies nothing", async () => {
    const game = await board().build();
    expect(game.state("vet").isExhausted).toBe(true);
    await game.p1.activate("yasuo", 0, { targets: "vet" });
    await game.settle({ policy: "first" });
    expect(game.locationOf("vet")).toBe("base");
    expect(game.state("vet").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the ability also goes the other way, base → an uncontested battlefield, and again changes nothing about exhaustion", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, UNFORGIVEN, "yasuo")
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3, name: "Veteran" }, "vet", { exhausted: true })
      .build();
    await game.p1.activate("yasuo", 0, { targets: "vet" });
    await game.settle({ policy: "first" });
    expect(game.locationOf("vet")).toBe("bf2");
    expect(game.state("vet").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
