/**
 * Ruling f5c12c9d47225507 — Gust (OGN-169 → ogn-169-298)
 *   "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × En Garde (ogn-046-298) "[Reaction] Give a friendly unit +1 [Might] this turn, then an additional
 *     +1 [Might] this turn if it is the only unit you control there."
 *
 * Q: Gust's target is pumped above 3 Might before Gust resolves — may the caster switch to another
 *    legal unit?
 * A: No. The object is declared as Gust goes on the chain and cannot be re-declared. If it no longer
 *    fits "3 Might or less" at resolution, Gust simply does nothing.
 * Rules: 355.12 (objects chosen on play), 359.3.e.5 (illegal object at resolution ⇒ no effect, no re-choice).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const EN_GARDE = "ogn-046-298";

/** P2 holds bf1 with a lone 3-Might Runner; a second 2-Might unit sits at bf2 as an alternative target. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bf2", { might: 2, name: "Straggler" }, "straggler")
    .hand(P1, GUST, "gust")
    .hand(P2, EN_GARDE, "enGarde");
}

describe("Ruling f5c12c9d47225507 — a Gust whose target grows out of range resolves with no effect and is not re-aimed", () => {
  test("control: unanswered, Gust bounces the 3-Might Runner to its owner's hand", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("both the Runner and the Straggler are legal targets when Gust is cast — so a re-aim would have somewhere to go", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options;
    expect((targets as string[][]).flat().sort()).toEqual(["runner", "straggler"]);
  });

  test("En Garde lifts the Runner past 3 Might in response: Gust resolves doing nothing, no new target is asked for, and the Straggler is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "runner" });
    expect(game.chain()[0]).toMatchObject({ cardId: "gust", targets: ["runner"] });
    await game.p1.passPriority();
    await game.p2.cast("enGarde", { targets: "runner" });

    // Let En Garde resolve; Gust is still waiting underneath.
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.state("runner").might).toBeGreaterThan(3); // alone at bf1 ⇒ +1 then +1 more
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);

    await game.acting().passPriority();
    await game.acting().passPriority(); // Gust resolves
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.zoneOf("runner")).toBe("battlefield-bf1"); // not bounced
    expect(game.zoneOf("straggler")).toBe("battlefield-bf2"); // not bounced instead
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
