/**
 * Zed, Without a Sound — ven-112a-166 · Champion Unit (Zed) · Chaos · 5 energy · 5 [Might]
 *
 *   When I conquer, play a 0 [Might] Shadow Clone unit token to your base.
 *   [Action] [1][chaos]: Move me and a Shadow Clone you control to each other's
 *   locations.
 *
 * rule 350.1 / 455 — the activated ability is a trade of locations (the same
 * `move`/`swap` shape as Tideturner and Azir); the partner pool is restricted
 * to Shadow Clones its controller controls.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-112a-166";

describe("Zed, Without a Sound (ven-112a-166)", () => {
  test("the activated ability swaps Zed and a Shadow Clone you control", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "zed")
      .unit(P1, "base", { might: 0, name: "Shadow Clone" }, "clone")
      .script(P1, ["clone"])
      .build();

    await game.p1.activate("zed");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle({ policy: "first" });

    expect(game.locationOf("zed")).toBe("base");
    expect(game.locationOf("clone")).toBe("bf1");
  });

  test("a non-Shadow-Clone friendly unit is not a legal swap partner", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "zed")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .build();

    // rule 355.8 — with no legal partner the ability may not be activated at all;
    // it must not charge [1][chaos] for an effect that resolves to nothing.
    expect(game.p1.can("activate", "zed")).toBe(false);
    expect(game.p1.resources()).toMatchObject({ energy: 1, power: { chaos: 1 } });
    expect(game.locationOf("zed")).toBe("bf1");
    expect(game.locationOf("squire")).toBe("base");
  });
});
