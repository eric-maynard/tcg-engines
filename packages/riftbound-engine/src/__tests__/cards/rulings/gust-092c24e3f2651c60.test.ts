/**
 * Ruling 092c24e3f2651c60 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · Reaction
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Spell · Mind · [1][mind] · Action · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *
 * Q: Can I cast a Reaction "between" the repeated damage of Bellows Breath to save my 2-health unit with Gust?
 * A: You can save it, but not "between" repeats: a repeated Bellows Breath is ONE spell on the chain whose
 *    instructions run twice on resolution. You react to the spell while it is on the chain; Gust resolves first
 *    (LIFO) and returns the unit to hand; Bellows Breath then resolves and simply ignores the now-invalid target.
 *    There is no window between the first and second execution.
 * Rules: 820 (Repeat = additional cost, effect executed again — a single chain item), 330–332 (Closed state /
 *        Reactions), 359.3.e.5 (invalid target at resolution is ignored), LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const BELLOWS_BREATH = "sfd-080-221";

/**
 * P2's turn. P1's 2-Might Scout sits at P1's bf1. P2 holds Bellows Breath with exactly [2] + 2 mind (base +
 * one Repeat); P1 holds Gust with exactly [1].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { mind: 2 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P2, BELLOWS_BREATH, "bb")
    .hand(P1, GUST, "gust");
}

/** P2 casts Bellows Breath at Scout paying the Repeat once, then passes priority to P1. */
async function repeatedBreathAtScout(game: Game): Promise<void> {
  expect(game.p2.option("cast", "bb")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
  await game.p2.cast("bb", { repeat: 1, targets: ["scout"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // [1][mind] + Repeat [1][mind]
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
}

describe("Ruling 092c24e3f2651c60 — Gust answers the (single) repeated Bellows Breath, not an individual repeat", () => {
  test("a Bellows Breath cast with its Repeat paid is ONE item on the chain (state Closed), and P1 gets a Reaction window against it", async () => {
    const game = await board().build();
    await repeatedBreathAtScout(game);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P2, targets: ["scout"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
  });

  test("control: unanswered, the repeated spell resolves in one go — Scout takes 1 + 1 = lethal and dies; no decision is offered between the two executions", async () => {
    const game = await board().build();
    await repeatedBreathAtScout(game);
    await game.p1.passPriority(); // both passed → resolves completely
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    // Straight back to P2's open main phase — nothing was asked mid-resolution.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("Gust in response goes on top; LIFO: Gust resolves first (Scout → P1's hand), then Bellows Breath resolves ignoring its now-invalid target — Scout takes nothing and survives in hand (359.3.e.5)", async () => {
    const game = await board().build();
    await repeatedBreathAtScout(game);
    await game.p1.cast("gust", { targets: "scout" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb", "gust"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toContain("scout");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]); // the whole repeated spell is still one pending item
    // Both pass again → Bellows Breath resolves as a whole with nothing legal to hit.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").damage).toBe(0);
    expect(game.p1.trash()).toEqual(["gust"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
