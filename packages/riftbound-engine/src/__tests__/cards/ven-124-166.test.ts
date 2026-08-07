/**
 * Escaped Grayback (ven-124-166) — Unit, Order, 3 energy, 3 Might.
 *
 * "[Empower] — Kill a friendly unit (Pay the cost: Empower me. Use only if not Empowered.)
 *  [Empowered][>] I have +2 [Might]."
 *
 * rule 827.1.c.1: [Empower] is sugar for "COST: Empower me. Use only if not
 * Empowered." — here the cost is a prose cost (kill a friendly unit), not an
 * energy/rune/exhaust symbol.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-124-166";

describe("Escaped Grayback (ven-124-166)", () => {
  test("the [Empower] ability is activatable by killing a friendly unit", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "grayback")
      .unit(P1, "base", { might: 1 }, "fodder")
      .build();

    expect(game.state("grayback").isEmpowered).toBeFalsy();
    await game.p1.activate("grayback", 0, { sacrifice: "fodder" });
    await game.settle();

    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("grayback").isEmpowered).toBe(true);
  });

  test("[Empowered] grants +2 Might once empowered", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "grayback")
      .unit(P1, "base", { might: 1 }, "fodder")
      .build();

    expect(game.state("grayback").might).toBe(3);
    await game.p1.activate("grayback", 0, { sacrifice: "fodder" });
    await game.settle();
    expect(game.state("grayback").might).toBe(5);
  });

  test("rule 827.1.c.1: the ability is not offered again once Empowered", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "grayback")
      .unit(P1, "base", { might: 1 }, "fodder")
      .unit(P1, "base", { might: 1 }, "fodder2")
      .build();

    await game.p1.activate("grayback", 0, { sacrifice: "fodder" });
    await game.settle();
    expect(game.p1.can("activate", "grayback")).toBe(false);
  });
});
