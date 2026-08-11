/**
 * Ruling 1b72e261143c33c4 — Retreat (OGN-104 → ogn-104-298) · Reaction · Mind · [1]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: Can I cast Retreat on my unit, then answer it with a SECOND Retreat naming the same unit, bouncing one unit
 *    but channelling twice?
 * A: No. Casting the second one is legal (the unit is still on the board when it is played), but the chain is LIFO:
 *    the second Retreat resolves first and bounces the unit; when the first Retreat then resolves its unit is gone,
 *    so "its owner" is undefined — it returns nothing and channels nothing. One bounce, one rune.
 * Rules: 340 (LIFO), 355.5 (targets chosen on play), 359.3.e.5 / 359.3.e.12 (an instruction whose object is gone
 *        does nothing), 359.3.e.14 (the channel is linked to the unit that was returned), 127.1 (owner channels).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";

/** P1's turn, open main phase. P1 has a lone 2-Might Scout in base, two Retreats and exactly [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, RETREAT, "ret1")
    .hand(P1, RETREAT, "ret2");
}

const readyRunes = (game: Game) => game.p1.runes({ ready: true }).length;

/** Both Retreats stacked on the SAME Scout; nothing has resolved yet. */
async function doubleRetreatOnScout(): Promise<{ game: Game; runes0: number }> {
  const game = await board().build();
  const runes0 = game.p1.runes().length;
  await game.p1.cast("ret1", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ret1"]);
  // Nuance: the second Retreat is a legal play — the Scout is still on the board while it is being cast.
  expect(game.p1.can("cast", "ret2")).toBe(true);
  const offered = (game.p1.option("cast", "ret2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(offered).toContain("scout");
  await game.p1.cast("ret2", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ret1", "ret2"]);
  expect(game.p1.energy()).toBe(0);
  expect(game.zoneOf("scout")).toBe("base"); // still on the board — nothing has resolved
  expect(game.p1.runes()).toHaveLength(runes0);
  return { game, runes0 };
}

describe("Ruling 1b72e261143c33c4 — two Retreats on the same unit still channel only once", () => {
  test("nuance: stacking a second Retreat on the same unit is legal — chain is Retreat > Retreat, both paid", async () => {
    await doubleRetreatOnScout();
  });

  test("LIFO: the TOP Retreat resolves first — the Scout goes to hand and P1 channels exactly 1 exhausted rune", async () => {
    const { game, runes0 } = await doubleRetreatOnScout();
    await game.p1.passPriority();
    await game.p2.passPriority(); // ret2 resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("ret2")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(readyRunes(game)).toBe(0); // the freshly channelled rune arrived exhausted
    expect(game.chain().map((c) => c.cardId)).toEqual(["ret1"]); // the first Retreat is still waiting
  });

  test("ruling: the bottom Retreat then resolves with its unit already in hand — no second bounce, NO second rune (1 rune total, not 2)", async () => {
    const { game, runes0 } = await doubleRetreatOnScout();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ret1")).toBe("trash");
    expect(game.zoneOf("ret2")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runes0 + 1); // exactly one channel happened
    expect(readyRunes(game)).toBe(0);
    expect(game.p1.hand().toSorted()).toEqual(["scout"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: two Retreats naming DIFFERENT units do channel twice — so the single rune above is the fizzle, not a missing channel", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Runner" }, "runner").build();
    const runes0 = game.p1.runes().length;
    await game.p1.cast("ret1", { targets: "scout" });
    await game.p1.cast("ret2", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(readyRunes(game)).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
