/**
 * Ruling 77913099fd39b319 — Marching Orders (SFD-114 → sfd-114-221) · Spell · [3] · Action · [Repeat] [3]
 *   "Choose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their Mights
 *    to each other."
 *
 * Q: With [Repeat], if the friendly unit takes lethal damage in the first instance, does it die before the second?
 * A: No. Units only die in the Cleanup after the WHOLE spell has resolved, so the friendly unit completes both
 *    instances first and dies afterwards. [Repeat] is a cost paid once that makes the one spell bigger — it does not
 *    put a second copy on the chain — and each execution picks its own targets (they may repeat).
 * Rules: 820 ([Repeat]: one card, the effect executed again — no copy), 319/321 (deaths are checked in the Cleanup
 *        after the item leaves the chain, never mid-resolution), 417.1 (damage is marked, Might is unchanged).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MARCHING_ORDERS = "sfd-114-221";

/** P1's turn with exactly [6] (base [3] + [Repeat] [3]). P1's 5-Might Irelia stands in base; P2 holds bf1 with a
 *  5-Might Footman (lethal to her) and a 7-Might Watchman (survives her 5). */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Irelia" }, "irelia")
    .unit(P2, "bf1", { might: 5, name: "Footman" }, "footman")
    .unit(P2, "bf1", { might: 7, name: "Watchman" }, "watchman")
    .hand(P1, MARCHING_ORDERS, "mo");
}

describe("Ruling 77913099fd39b319 — [Repeat]ed Marching Orders finishes both instances before anyone dies", () => {
  test("premise: [Repeat] offers per-execution target sets and costs [3] more — the whole thing is ONE chain item, not two copies", async () => {
    const game = await board().build();
    const sets = game.p1.option("cast", "mo")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(sets).toContainEqual(["irelia", "footman", "irelia", "watchman"]);
    await game.p1.cast("mo", { repeat: 1, targets: ["irelia", "footman", "irelia", "watchman"] });
    expect(game.p1.energy()).toBe(0); // [3] + [Repeat] [3]
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "mo", targets: ["irelia", "footman", "irelia", "watchman"] });
  });

  test("ruling: Irelia takes lethal 5 from the Footman in the FIRST instance and still deals her 5 to the Watchman in the second", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { repeat: 1, targets: ["irelia", "footman", "irelia", "watchman"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // the whole spell resolves, then one Cleanup
    expect(game.state("watchman").damage).toBe(5); // proof the second instance happened
    expect(game.zoneOf("watchman")).toBe("battlefield-bf1"); // 5 < 7
    expect(game.zoneOf("footman")).toBe("trash"); // 5 damage on 5 Might
  });

  test("ruling: only after the full resolution does Irelia die — of 5 (Footman) + 7 (Watchman) = 12 damage on 5 Might", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { repeat: 1, targets: ["irelia", "footman", "irelia", "watchman"] });
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.zoneOf("mo")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without paying [Repeat] the spell costs [3], runs once, and the Watchman is never touched", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { targets: ["irelia", "footman"] });
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.state("watchman").damage).toBe(0);
    expect(game.zoneOf("footman")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("trash");
  });
});
