/**
 * Treasure Trove — ogn-186-298 · Gear · Chaos · 2 energy
 *
 *   When this leaves the board, draw 1 and channel 1 rune exhausted.
 *   [chaos], [Exhaust]: Kill this.
 *
 * Rules: 430 (Channel; "exhausted" = the rune enters exhausted), killing a permanent sends it
 * to its owner's trash — which is "leaving the board" and fires the first ability.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-186-298";

function withTrove(chaos = 1) {
  return scenario().resources(P1, { energy: 0, power: { chaos } }).gear(P1, CARD, "trove");
}

describe("Treasure Trove (ogn-186-298)", () => {
  test("costs 2 energy to play and lands in the base; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "trove").build();
    await game.p1.play("trove");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.p1.gear()).toContain("trove");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "trove").build();
    expect(poor.p1.can("play", "trove")).toBe(false);
  });

  test("[chaos], [Exhaust]: Kill this — pays 1 chaos, exhausts, and the Trove ends up in the trash", async () => {
    const game = await withTrove().build();
    expect(game.p1.can("activate", "trove")).toBe(true);
    await game.p1.activate("trove");
    expect(game.p1.power("chaos")).toBe(0);
    await game.settle();
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.p1.gear()).not.toContain("trove");
  });

  test("the activated ability is not available without [chaos] to pay, or while the Trove is exhausted", async () => {
    const noChaos = await withTrove(0).build();
    expect(noChaos.p1.can("activate", "trove")).toBe(false);
    const tapped = await scenario().resources(P1, { power: { chaos: 1 } }).gear(P1, CARD, "trove", { exhausted: true }).build();
    expect(tapped.p1.can("activate", "trove")).toBe(false);
  });

  test.failing("BUG: when it leaves the board (killed by its own ability) its controller draws 1 and channels 1 rune exhausted", async () => {
    // Expected: after the kill resolves → hand +1, rune pool +1 (that rune exhausted), rune deck -1.
    // Actual: the parser produced only the activated ability; the leaves-the-board trigger is missing.
    const game = await withTrove().build();
    const handBefore = game.p1.hand().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.activate("trove");
    await game.settle();
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
  });

  test("nothing is drawn or channeled while the Trove simply stays on the board across turns", async () => {
    const game = await withTrove().build();
    const handBefore = game.p1.hand().length;
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.p1.runes()).toHaveLength(0);
  });
});
