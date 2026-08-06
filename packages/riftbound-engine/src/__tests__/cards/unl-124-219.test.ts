/**
 * Isolate — unl-124-219 · Spell (Action) · Chaos · 2 energy
 *
 *   Move an enemy unit from a battlefield to its base. Then, if there's an
 *   enemy unit alone at that battlefield, draw 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-124-219";

describe("Isolate (unl-124-219)", () => {
  test("moves an enemy unit to base and draws 1 when an enemy unit is left alone there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe1")
      .unit(P2, "bf1", { might: 3 }, "foe2")
      .hand(P1, CARD, "isolate")
      .build();

    const handBefore = game.p1.hand().length;
    await game.p1.cast("isolate", { targets: "foe1" });
    await game.settle();
    expect(game.locationOf("foe1")).toBe("base");
    expect(game.locationOf("foe2")).toBe("bf1");
    // -1 for the spell, +1 for the draw
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.zoneOf("isolate")).toBe("trash");
  });

  test("no draw when the battlefield is left empty", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe1")
      .hand(P1, CARD, "isolate")
      .build();

    const handBefore = game.p1.hand().length;
    await game.p1.cast("isolate", { targets: "foe1" });
    await game.settle();
    expect(game.locationOf("foe1")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });

  test("no draw when two enemy units remain at that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe1")
      .unit(P2, "bf1", { might: 3 }, "foe2")
      .unit(P2, "bf1", { might: 1 }, "foe3")
      .hand(P1, CARD, "isolate")
      .build();

    const handBefore = game.p1.hand().length;
    await game.p1.cast("isolate", { targets: "foe1" });
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });
});
