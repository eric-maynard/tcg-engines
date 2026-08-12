/**
 * Ruling f294a2f9c23f2751 — Red Brambleback (UNL-029 → unl-029-219) · 4 Might · 4 + [fury]
 *   "[Accelerate] / Your conquer effects for conquering here trigger an additional time. /
 *    When I conquer, [Buff] a friendly unit."
 *   × Kai'Sa, Survivor (ogn-039-298) · 4 Might "[Accelerate] / When I conquer, draw 1."
 *
 * Q: Does Red Brambleback work with battlefield conquer effects?
 * A: Yes. When you conquer the battlefield Brambleback is at, each of your conquer effects — its own
 *    and those on your other units — triggers once for the conquer and then an additional time. It
 *    only applies to conquering HERE, and it needs a real conquer: no conquer, no conquer effects.
 * Rules: 465/471.2.c (conquering is a Score; a battlefield already scored this turn cannot be
 *        conquered again), 383.2 (each triggering puts its own item on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRAMBLEBACK = "unl-029-219";
const KAISA = "ogn-039-298";
const FILLER = "ogn-175-298";

/** Answer every outstanding prompt with `picks` in order, settling in between. */
async function settleWithPicks(game: Game, picks: string[]): Promise<void> {
  const queue = [...picks];
  for (let i = 0; i < 10; i++) {
    const stop = await game.settle();
    if (stop.reason !== "unanswered") {
      return;
    }
    const next = queue.shift();
    expect(next).toBeDefined();
    await game.acting().pick(next!);
  }
}

describe("Ruling f294a2f9c23f2751 — Red Brambleback makes your conquer effects for THIS battlefield trigger an additional time", () => {
  test("conquering with Brambleback present doubles both conquer effects: two buff prompts and two draws", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", BRAMBLEBACK, "bramble")
      .unit(P1, "base", KAISA, "kaisa")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P2, "bf1", { might: 1, name: "Watcher" }, "watcher")
      .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"])
      .build();
    await game.p1.move(["bramble", "kaisa"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await settleWithPicks(game, ["pal", "bramble"]);

    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1); // one conquer, one point — only the EFFECTS are doubled
    expect(game.p1.hand()).toEqual(["d1", "d2"]); // Kai'Sa's "draw 1" fired twice
    expect(game.state("pal").isBuffed).toBe(true);
    expect(game.state("bramble").isBuffed).toBe(true); // Brambleback's own buff effect fired twice
    expect(game.violations()).toEqual([]);
  });

  test("'here' matters: conquering a battlefield Brambleback is NOT at triggers the conquer effect only once", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", BRAMBLEBACK, "bramble")
      .unit(P1, "base", KAISA, "kaisa")
      .unit(P2, "bf2", { might: 1, name: "Watcher" }, "watcher")
      .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"])
      .build();
    await game.p1.move("kaisa", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await settleWithPicks(game, []);
    expect(game.gameState.battlefields.bf2).toMatchObject({ controller: P1 });
    expect(game.p1.hand()).toEqual(["d1"]); // once, not twice
    expect(game.violations()).toEqual([]);
  });

  test("no conquer, no conquer effects: walking into an EMPTY battlefield that P1 already controls triggers nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .unit(P1, "base", BRAMBLEBACK, "bramble")
      .unit(P1, "base", KAISA, "kaisa")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .build();
    await game.p1.move(["bramble", "kaisa"], "bf1");
    await settleWithPicks(game, []);
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("bramble").isBuffed).toBe(false);
    expect(game.p1.points()).toBe(0);
  });
});
