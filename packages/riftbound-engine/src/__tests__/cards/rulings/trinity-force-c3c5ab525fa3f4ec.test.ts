/**
 * Ruling c3c5ab525fa3f4ec — Trinity Force (SFD-115 → sfd-115-221, Equipment +2) "When I hold, score 1 point."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221, Equipment +2) "My hold effects are also conquer effects, and vice versa."
 *
 * Q: I'm at 7 points, my opponent controls both battlefields, and I conquer one with a unit ("Lucian") wearing TWO Trinity Forces and one
 *    Skyfall of Areion. Do I win?
 * A: Yes. The conquer itself can't give the Final Point (you haven't scored every battlefield this turn) — you draw instead. But Skyfall
 *    makes each Trinity Force's "When I hold" a conquer effect too, so both trigger and go on the chain; when the FIRST one resolves you
 *    reach 8 and win immediately. Points from triggered abilities ignore the Final-Point restriction. (Skyfall doesn't stack, but two
 *    Trinity Forces are two separate triggers.)
 * Rules: 471.1.b.1 (Final Point via Conquer needs every battlefield scored — else draw), 471.1.a.1 (non-Conquer points unrestricted),
 *        718.3 (Equipment effect text belongs to the wearer), 383 / 340 (triggers → chain, resolve one at a time), 323.1 (win at 8).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";

/**
 * P1's turn at 7 of 8. P2 controls BOTH battlefields (Guard 2 at bf1, Far Guard 2 at bf2). P1's Lucian (3 +2 +2 +2 = 9) in base wears
 * Skyfall + Trinity Force ×2.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "base", { might: 3, name: "Lucian" }, "lucian", { equippedWith: ["sky", "tf1", "tf2"] } as Record<string, unknown>)
    .card("sky", { def: SKYFALL, meta: { attachedTo: "lucian" } as Record<string, unknown>, owner: P1, zone: "base" })
    .card("tf1", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" } as Record<string, unknown>, owner: P1, zone: "base" })
    .card("tf2", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" } as Record<string, unknown>, owner: P1, zone: "base" });
}

/** Lucian attacks bf1; both pass Focus; combat resolves (9 vs 2) and P1 conquers. Stops at the first post-conquer decision. */
async function conquerBf1(): Promise<{ game: Game; hand0: number }> {
  const game = await board().build();
  expect(game.state("lucian")).toMatchObject({ attachments: ["sky", "tf1", "tf2"], might: 9 });
  expect(game.p2.battlefields({ controlled: true }).toSorted()).toEqual(["bf1", "bf2"]);
  const hand0 = game.p1.hand().length;
  await game.p1.move("lucian", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("guard")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return { game, hand0 };
}

describe("Ruling c3c5ab525fa3f4ec — at 7, conquering with 2× Trinity Force + Skyfall wins off the first Trinity trigger", () => {
  test("the Conquer itself does NOT give the Final Point (bf2 was not scored this turn) — P1 stays on 7 and draws instead; the game is not over yet", async () => {
    const { game, hand0 } = await conquerBf1();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(hand0 + 1); // 471.1.b.1: draw instead of the point
    expect(game.isOver()).toBe(false);
  });

  test("Skyfall turns BOTH Trinity Forces' hold effects into conquer effects: two separate triggered items from Lucian go on the chain (P1 may order them), still at 7", async () => {
    const { game } = await conquerBf1();
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.acceptTriggerOrder();
    }
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true }),
    ]);
    expect(game.p1.points()).toBe(7);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("as soon as the FIRST Trinity trigger resolves P1 reaches 8 and wins immediately — a triggered-ability point ignores the Final-Point restriction; the second trigger never needs to resolve", async () => {
    const { game } = await conquerBf1();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item resolves
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.chain().length).toBeLessThanOrEqual(1); // the other Trinity item was still waiting (or was cleared by game end)
    expect(game.violations()).toEqual([]);
  });

  test("control — with NO Skyfall the two Trinity Forces are hold-only: the same conquer at 7 puts nothing on the chain and P1 is stuck on 7 (plus the draw)", async () => {
    const noSky = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
      .unit(P1, "base", { might: 3, name: "Lucian" }, "lucian", { equippedWith: ["tf1", "tf2"] } as Record<string, unknown>)
      .card("tf1", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" } as Record<string, unknown>, owner: P1, zone: "base" })
      .card("tf2", { def: TRINITY_FORCE, meta: { attachedTo: "lucian" } as Record<string, unknown>, owner: P1, zone: "base" })
      .build();
    expect(noSky.state("lucian").might).toBe(7);
    await noSky.p1.move("lucian", "bf1");
    await noSky.settle();
    expect(noSky.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(noSky.chain()).toEqual([]);
    expect(noSky.p1.points()).toBe(7);
    expect(noSky.isOver()).toBe(false);
  });
});
