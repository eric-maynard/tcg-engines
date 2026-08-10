/**
 * Ruling 07223f462d2167c0 — (general rules question, no specific card)
 *
 * Q: Can multiple units be on the same battlefield, and if so, do you score a point for each?
 * A: Yes, any number of your units can be at one battlefield, but a battlefield is only ever worth ONE point per turn to
 *    you (Conquer or Hold), however many units you have there. If you control a battlefield you may also play units there
 *    instead of to your base.
 * Rules: 141 / 181 (units at battlefields), 442 (Conquer / Hold score 1 point per battlefield), 441.2 (each battlefield
 *        scores at most once per turn for a player), 354.2 (play a unit to your base or a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", energyCost: 1, might: 2, name: "Grunt" } as const;

describe("Ruling 07223f462d2167c0 — many units at one battlefield, still one point per battlefield per turn", () => {
  test("three P1 units attack and conquer bf1 together: all three stand there afterwards, and P1 scores exactly 1 (not 3)", async () => {
    const game = await scenario()
      .turn(3)
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P1, "base", { might: 3, name: "One" }, "u1")
      .unit(P1, "base", { might: 3, name: "Two" }, "u2")
      .unit(P1, "base", { might: 3, name: "Three" }, "u3")
      .build();
    await game.p1.move(["u1", "u2", "u3"], "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.units("bf1").toSorted()).toEqual(["u1", "u2", "u3"]); // several units share the battlefield
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("holding bf1 with three units at the start of P1's next turn is likewise worth exactly 1 Hold point", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "One" }, "u1")
      .unit(P1, "bf1", { might: 3, name: "Two" }, "u2")
      .unit(P1, "bf1", { might: 3, name: "Three" }, "u3")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "by")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // → P1's turn; Beginning Phase Hold scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // …and the same battlefield can't score again this turn (e.g. no second point appears by the Main Phase).
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
  });

  test("nuance: controlling bf1 lets P1 play a unit from hand directly TO bf1 (offered alongside base); an uncontrolled/enemy battlefield is not offered", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Theirs" }, "theirs")
      .hand(P1, GRUNT, "grunt")
      .build();
    const to = (game.p1.option("play", "grunt")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(to).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(to).not.toContain("battlefield-bf2");
    expect(to).not.toContain("battlefield-bf3");
    await game.p1.play("grunt", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("grunt")).toBe("bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["grunt", "holder"]);
    expect(game.violations()).toEqual([]);
  });
});
