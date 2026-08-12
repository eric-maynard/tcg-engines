/**
 * Ruling 499e8bc39a1e87aa — Star-Crossed (UNL-128 → unl-128-219)
 *   "[Reaction] Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Do I need to control a unit to play Star-Crossed?
 * A: Yes. Both targets are mandatory (no "up to"), so a legal friendly unit AND a legal enemy unit
 *    must exist when the spell is announced. With no friendly unit on the board the spell cannot be
 *    played at all; with one, both units go back to their owners' hands.
 * Rules: 355.8 (a spell with no legal target for a required instruction can't be played), 355.12.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

describe("Ruling 499e8bc39a1e87aa — Star-Crossed needs BOTH a friendly and an enemy unit to be playable", () => {
  test("no friendly unit on the board ⇒ Star-Crossed cannot be cast (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, STAR_CROSSED, "sc")
      .build();

    expect(game.p1.base()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "sc")).toBe(false);
    expect(game.p1.option("cast", "sc")).toBeUndefined();
    const attempt = await game.p1.try((p) => p.cast("sc", { targets: ["foe", "foe"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("no ENEMY unit on the board ⇒ likewise unplayable (the mirror half of the same requirement)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, STAR_CROSSED, "sc")
      .build();

    expect(game.p1.can("cast", "sc")).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
  });

  test("with a friendly AND an enemy unit it is playable, and both are returned to their owners' hands", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, STAR_CROSSED, "sc")
      .build();

    expect(game.p1.can("cast", "sc")).toBe(true);
    await game.p1.cast("sc", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
