/**
 * Ruling ba8e9b2a1c8e7b98 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Star-Crossed (UNL-128 → unl-128-219) · [Reaction] 3+[chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · [Reaction] 1 "Deal 1 to all units at battlefields."
 *
 * Q: Opponent Star-Crosses (their unit + my Elder Dragon); I respond with Flurry of Blades, which (thanks to Elder Dragon)
 *    kills their unit. Does Star-Crossed still resolve and bounce my Elder Dragon?
 * A: Yes. A spell resolves even if some targets became illegal: the instruction for the dead unit is ignored, the still-legal
 *    Elder Dragon is returned to hand. It does not fizzle.
 * Rules: 359.3.e.1 / 359.3.e.5 (illegal or missing targets are skipped, the rest resolves), 340.1 (LIFO), 142.4.c (Elder Dragon).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const STAR_CROSSED = "unl-128-219";
const FLURRY_OF_BLADES = "ogn-133-298";

/** P2's turn. P1's Elder Dragon holds bf2; P2's 3-Might Scout holds bf1. P2: Star-Crossed + [3][chaos]. P1: Flurry of Blades + [1]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "bf2", ELDER_DRAGON, "elder")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P1, FLURRY_OF_BLADES, "flurry");
}

/** P2 casts Star-Crossed [Scout, Elder]; P1 answers with Flurry of Blades on top. */
async function castBoth(game: Game): Promise<void> {
  await game.p2.cast("sc", { targets: ["scout", "elder"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2, targets: ["scout", "elder"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "flurry")).toBe(true);
  await game.p1.cast("flurry");
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "flurry"]);
}

describe("Ruling ba8e9b2a1c8e7b98 — Star-Crossed still resolves after Flurry (via Elder Dragon) kills one of its targets", () => {
  test("control: unanswered, Star-Crossed returns BOTH the Scout and Elder Dragon to their owners' hands", async () => {
    const game = await board().build();
    await game.p2.cast("sc", { targets: ["scout", "elder"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("elder")).toBe("hand");
    expect(game.p2.hand()).toEqual(["scout"]);
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["elder", "flurry"]));
  });

  test("Flurry of Blades resolves first (LIFO): 1 damage from P1 is lethal to the ENEMY Scout because of Elder Dragon → Scout dies; Elder takes 1 and lives; Star-Crossed still waits on the chain", async () => {
    const game = await board().build();
    await castBoth(game);
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "flurry"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("elder")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
  });

  test("Star-Crossed then resolves anyway: the dead Scout's instruction is ignored (it stays in the trash, not hand) and Elder Dragon IS returned to P1's hand", async () => {
    const game = await board().build();
    await castBoth(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("elder")).toBe("hand");
    expect(game.p1.hand()).toEqual(["elder"]);
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
