/**
 * Ruling bfac91eed036cecd — Portal Rescue (OGN-102 → ogn-102-298) · Action [3][mind]
 *   "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   × Tasty Faefolk (OGN-075 → ogn-075-298) · 6 Might
 *     "[Accelerate] (You may pay [1][calm] as an additional cost to have me enter ready.)"
 *
 * Q: How does Portal Rescue interact with a unit that has [Accelerate] — are the Power/Accelerate costs paid?
 * A: "Ignoring its cost" waives only the unit's own Energy and Power cost. [Accelerate] is an ADDITIONAL
 *    cost, not part of that base cost, so it is not waived: you are still offered it, and you must pay the
 *    [1][calm] if you want the unit to enter ready.
 * Rules: 204.2/356 (base cost vs. additional costs), 419.2 (playing a card an effect tells you to play still
 *        goes through the normal cost steps for anything not waived), [Accelerate] keyword.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const TASTY_FAEFOLK = "ogn-075-298"; // [Accelerate] [1][calm], printed cost [7]

/** P1's turn with [5] energy, [mind] for the spell and one spare [calm] for a possible Accelerate. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1, mind: 1 } })
    .unit(P1, "base", TASTY_FAEFOLK, "fae", undefined, { exhausted: true })
    .hand(P1, PORTAL_RESCUE, "pr");
}

/** Cast Portal Rescue on the Faefolk and let it resolve up to the [Accelerate] offer. */
async function rescue(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pr", { targets: "fae" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling bfac91eed036cecd — Portal Rescue waives the base cost but NOT [Accelerate]", () => {
  test("ruling: the replay offers [Accelerate] as a payable additional cost — it was not ignored along with the base cost", async () => {
    const game = await rescue();
    expect(game.decision()).toMatchObject({
      canAccept: true,
      kind: "yes-no",
      prompt: expect.stringContaining("[Accelerate]"),
      seat: P1,
      source: { cardId: "fae" },
    });
    expect(game.zoneOf("fae")).toBe("banishment"); // banished, waiting to be replayed
  });

  test("ruling: the unit's own [7] Energy and its Power cost ARE ignored — only Portal Rescue's [3][mind] left the pool", async () => {
    const game = await rescue();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 0 } }); // 5 − 3, mind spent
  });

  test("ruling: paying the [1][calm] Accelerate cost brings the 6-Might Faefolk back READY", async () => {
    const game = await rescue();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, mind: 0 } }); // the extra [1][calm]
  });

  test("ruling: declining it is free — the unit still comes back (cost ignored) but enters exhausted", async () => {
    const game = await rescue();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with no [calm] to spare the Accelerate simply cannot be taken — the free replay still happens", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P1, "base", TASTY_FAEFOLK, "fae", undefined, { exhausted: true })
      .hand(P1, PORTAL_RESCUE, "pr")
      .build();
    await game.p1.cast("pr", { targets: "fae" });
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });
});
