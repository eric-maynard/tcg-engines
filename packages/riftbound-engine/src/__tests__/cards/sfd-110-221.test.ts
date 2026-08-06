/**
 * Fiora, Peerless — sfd-110-221 · Unit · Body · 3 energy · 3 might · Champion
 *
 *   When I attack or defend one on one, double my Might this combat.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const FIORA = "sfd-110-221";

describe("Fiora, Peerless (sfd-110-221)", () => {
  test("attacking one on one doubles her Might for the combat (3 -> 6 kills a 5)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", FIORA, "fiora")
      .build();

    await game.p1.move("fiora", "bf1");
    await game.settle();

    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("the doubling expires at end of combat (rule 466.7.c) — survivor is back to 3 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P1, "base", FIORA, "fiora")
      .build();

    await game.p1.move("fiora", "bf1");
    await game.settle();

    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("fiora")).toBe("bf1");
    expect(game.state("fiora").might).toBe(3);
    expect(game.state("fiora").meta.combatMightModifier ?? 0).toBe(0);
  });
});
