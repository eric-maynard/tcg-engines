/**
 * Ruling 335406b156c17770 — Tideturner (OGN-199 → ogn-199-298)
 *   "[Hidden] When you play me, you may choose a unit you control at another location.
 *    Move me to its location and it to my original location."
 *   × Gust Monk (VEN-101 → ven-101-166), the chosen unit in base
 *   × Gust (OGN-169 → ogn-169-298) "[Reaction] Return a unit at a battlefield with 3 [Might] or less
 *     to its owner's hand."
 *
 * Q: Tideturner is revealed at a battlefield and its trigger targets the Monk in base; the opponent
 *    Gusts Tideturner before the trigger resolves. Does the Monk still move?
 * A: No. With Tideturner gone, "my original location" cannot be determined at resolution, so nothing
 *    moves. Same if Tideturner is killed instead. And if Tideturner ends up at the SAME location as
 *    the chosen unit before resolution, nobody moves either.
 * Rules: 359.3.e (an object that has left is looked up by last-known information / the instruction
 *        fizzles), 355.15, 811.1.c.3 (playing from hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const GUST_MONK = "ven-101-166";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024"; // [Reaction] "Move up to 2 friendly units to base."

/** [Reaction] "Deal 5 to a unit." — kills the 2-Might Tideturner on the chain. */
const ZAP = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Zap",
  rulesText: "[Reaction] Deal 5 to a unit.",
  timing: "reaction",
} as const;

/** P1 controls bf1 (an Anchor holds it) with Tideturner hidden there; the Monk waits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P1, "base", GUST_MONK, "monk");
}

/** Flip Tideturner at bf1, opt into its trigger and let it bind the Monk; stop with it on the chain. */
async function flipAndTarget(game: Game): Promise<void> {
  await game.p1.reveal("tide");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  expect(game.locationOf("tide")).toBe("bf1");
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "tide", controller: P1, triggered: true }),
  ]);
}

describe("Ruling 335406b156c17770 — removing Tideturner before its swap resolves leaves the chosen unit where it is", () => {
  test("control: undisturbed, the trigger swaps them — Tideturner to base, the Monk to bf1", async () => {
    const game = await board().build();
    await flipAndTarget(game);
    await game.settle();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("monk")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test(
    "ruling 335406b156c17770 — Gusting Tideturner to hand leaves the Monk in base",
    async () => {
      // Expected (359.3.e / 355.15): with Tideturner in its owner's hand there is no "my original
      // location", so nothing moves. Actual: the Monk is bounced to hand and Tideturner reappears in base.
      const game = await board().hand(P2, GUST, "gust").build();
      await flipAndTarget(game);
      await game.p1.passPriority();
      await game.p2.cast("gust", { targets: "tide" });
      await game.p2.passPriority();
      await game.p1.passPriority(); // Gust resolves first (LIFO)
      expect(game.zoneOf("tide")).toBe("hand");
      expect(game.locationOf("monk")).toBe("base");
      await game.settle(); // now the orphaned trigger resolves
      expect(game.locationOf("monk")).toBe("base"); // the Monk does NOT move
      expect(game.zoneOf("tide")).toBe("hand"); // …and Tideturner does not come back
    },
  );

  test(
    "ruling 335406b156c17770 — killing Tideturner likewise leaves the Monk in base",
    async () => {
      const game = await board().hand(P2, ZAP, "zap").build();
      await flipAndTarget(game);
      await game.p1.passPriority();
      await game.p2.cast("zap", { targets: "tide" });
      await game.settle();
      expect(game.zoneOf("tide")).toBe("trash");
      expect(game.zoneOf("monk")).toBe("base");
      expect(game.locationOf("monk")).toBe("base");
    },
  );

  test("if Tideturner is moved to the SAME location as the chosen unit before resolution, nobody moves", async () => {
    const game = await board().hand(P1, FLASH, "flash").build();
    await flipAndTarget(game);
    await game.p1.cast("flash", { targets: ["tide"] }); // Tideturner joins the Monk in base
    await game.settle();
    expect(game.locationOf("tide")).toBe("base");
    expect(game.locationOf("monk")).toBe("base"); // unmoved: the two share a location
    expect(game.violations()).toEqual([]);
  });
});
